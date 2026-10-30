export function removeWhiteBackgroundPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    pixels.length !== width * height * 4
  ) {
    throw new RangeError("Invalid image dimensions or pixel data.");
  }

  const isBackground = (pixelIndex: number) => {
    const offset = pixelIndex * 4;
    if (pixels[offset + 3] === 0) return false;
    const red = pixels[offset];
    const green = pixels[offset + 1];
    const blue = pixels[offset + 2];
    return (
      Math.min(red, green, blue) >= 200 &&
      Math.max(red, green, blue) - Math.min(red, green, blue) <= 60
    );
  };

  const spans: number[] = [];
  const enqueueRun = (y: number, seedX: number) => {
    let left = seedX;
    let right = seedX;
    let pixelIndex = y * width + seedX;

    while (left > 0 && isBackground(pixelIndex - 1)) {
      left--;
      pixelIndex--;
    }
    while (right < width - 1 && isBackground(pixelIndex + right - left + 1)) {
      right++;
    }

    for (let x = left; x <= right; x++) {
      pixels[(y * width + x) * 4 + 3] = 0;
    }
    spans.push(y, left, right);
  };

  const enqueueIfBackground = (x: number, y: number) => {
    if (isBackground(y * width + x)) enqueueRun(y, x);
  };

  for (let x = 0; x < width; x++) {
    enqueueIfBackground(x, 0);
    if (height > 1) enqueueIfBackground(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    enqueueIfBackground(0, y);
    if (width > 1) enqueueIfBackground(width - 1, y);
  }

  while (spans.length > 0) {
    const right = spans.pop()!;
    const left = spans.pop()!;
    const y = spans.pop()!;

    for (const nextY of [y - 1, y + 1]) {
      if (nextY < 0 || nextY >= height) continue;

      let x = left;
      while (x <= right) {
        if (!isBackground(nextY * width + x)) {
          x++;
          continue;
        }

        let runRight = x;
        while (
          runRight < width - 1 &&
          isBackground(nextY * width + runRight + 1)
        ) {
          runRight++;
        }
        enqueueRun(nextY, x);
        x = runRight + 1;
      }
    }
  }
}

export interface ImageBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DocumentQuad {
  topLeft: { x: number; y: number };
  topRight: { x: number; y: number };
  bottomRight: { x: number; y: number };
  bottomLeft: { x: number; y: number };
}

export interface DetectedDocument {
  corners: DocumentQuad;
  area: number;
}

function median(values: number[]) {
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)] ?? 0;
}

export function detectDocument(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): DetectedDocument | null {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    pixels.length !== width * height * 4
  ) {
    throw new RangeError("Invalid image dimensions or pixel data.");
  }

  const edgeColors: [number[], number[], number[]] = [[], [], []];
  const edgeStep = Math.max(1, Math.floor((width + height) / 512));
  const addEdgePixel = (x: number, y: number) => {
    const offset = (y * width + x) * 4;
    edgeColors[0].push(pixels[offset]);
    edgeColors[1].push(pixels[offset + 1]);
    edgeColors[2].push(pixels[offset + 2]);
  };
  for (let x = 0; x < width; x += edgeStep) {
    addEdgePixel(x, 0);
    if (height > 1) addEdgePixel(x, height - 1);
  }
  for (let y = edgeStep; y < height - 1; y += edgeStep) {
    addEdgePixel(0, y);
    if (width > 1) addEdgePixel(width - 1, y);
  }

  const background = edgeColors.map(median);
  const edgeDistances: number[] = [];
  const measureDistance = (offset: number) =>
    Math.hypot(
      pixels[offset] - background[0],
      pixels[offset + 1] - background[1],
      pixels[offset + 2] - background[2],
    );
  for (let x = 0; x < width; x += edgeStep) {
    edgeDistances.push(measureDistance(x * 4));
    if (height > 1) {
      edgeDistances.push(measureDistance(((height - 1) * width + x) * 4));
    }
  }
  for (let y = edgeStep; y < height - 1; y += edgeStep) {
    edgeDistances.push(measureDistance(y * width * 4));
    if (width > 1) {
      edgeDistances.push(measureDistance((y * width + width - 1) * 4));
    }
  }
  const threshold = Math.max(28, Math.min(80, median(edgeDistances) * 3 + 18));

  const backgroundPixels = new Uint8Array(width * height);
  const queue = new Uint32Array(width * height);
  let queueStart = 0;
  let queueEnd = 0;
  const enqueueBackground = (index: number) => {
    if (
      backgroundPixels[index] ||
      measureDistance(index * 4) > threshold
    ) {
      return;
    }
    backgroundPixels[index] = 1;
    queue[queueEnd++] = index;
  };
  for (let x = 0; x < width; x++) {
    enqueueBackground(x);
    if (height > 1) enqueueBackground((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y++) {
    enqueueBackground(y * width);
    if (width > 1) enqueueBackground(y * width + width - 1);
  }

  while (queueStart < queueEnd) {
    const index = queue[queueStart++];
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) enqueueBackground(index - 1);
    if (x < width - 1) enqueueBackground(index + 1);
    if (y > 0) enqueueBackground(index - width);
    if (y < height - 1) enqueueBackground(index + width);
  }

  const visited = new Uint8Array(width * height);
  const componentQueue = new Uint32Array(width * height);
  let largest: DetectedDocument | null = null;
  let largestArea = 0;
  const area2 = (points: { x: number; y: number }[]) => {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const current = points[i];
      const next = points[(i + 1) % points.length];
      area += current.x * next.y - next.x * current.y;
    }
    return Math.abs(area) / 2;
  };

  for (let start = 0; start < width * height; start++) {
    if (backgroundPixels[start] || visited[start]) continue;

    let startIndex = 0;
    let endIndex = 0;
    componentQueue[endIndex++] = start;
    visited[start] = 1;
    let area = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let minSum = Number.POSITIVE_INFINITY;
    let maxSum = Number.NEGATIVE_INFINITY;
    let minDifference = Number.POSITIVE_INFINITY;
    let maxDifference = Number.NEGATIVE_INFINITY;
    let topLeft = { x: 0, y: 0 };
    let topRight = { x: 0, y: 0 };
    let bottomRight = { x: 0, y: 0 };
    let bottomLeft = { x: 0, y: 0 };

    while (startIndex < endIndex) {
      const index = componentQueue[startIndex++];
      const x = index % width;
      const y = Math.floor(index / width);
      area++;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      const sum = x + y;
      const difference = x - y;
      if (sum < minSum) {
        minSum = sum;
        topLeft = { x, y };
      }
      if (sum > maxSum) {
        maxSum = sum;
        bottomRight = { x, y };
      }
      if (difference > maxDifference) {
        maxDifference = difference;
        topRight = { x, y };
      }
      if (difference < minDifference) {
        minDifference = difference;
        bottomLeft = { x, y };
      }

      const neighbors = [
        x > 0 ? index - 1 : -1,
        x < width - 1 ? index + 1 : -1,
        y > 0 ? index - width : -1,
        y < height - 1 ? index + width : -1,
      ];
      for (const neighbor of neighbors) {
        if (neighbor < 0 || backgroundPixels[neighbor] || visited[neighbor]) {
          continue;
        }
        visited[neighbor] = 1;
        componentQueue[endIndex++] = neighbor;
      }
    }

    const corners = { topLeft, topRight, bottomRight, bottomLeft };
    const polygonArea = area2([
      topLeft,
      topRight,
      bottomRight,
      bottomLeft,
    ]);
    const points = [topLeft, topRight, bottomRight, bottomLeft];
    const crossProducts = points.map((point, index) => {
      const next = points[(index + 1) % points.length];
      const afterNext = points[(index + 2) % points.length];
      return (
        (next.x - point.x) * (afterNext.y - next.y) -
        (next.y - point.y) * (afterNext.x - next.x)
      );
    });
    const isConvex =
      crossProducts.every((cross) => cross > 0) ||
      crossProducts.every((cross) => cross < 0);
    const fillsFrame =
      minX === 0 &&
      minY === 0 &&
      maxX === width - 1 &&
      maxY === height - 1;
    if (
      area > largestArea &&
      isConvex &&
      !fillsFrame &&
      polygonArea >= width * height * 0.002 &&
      area / polygonArea >= 0.08
    ) {
      largestArea = area;
      largest = { corners, area };
    }
  }

  return largest;
}

export function estimateForegroundAngle(
  pixels: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  bounds: ImageBounds,
): number {
  if (
    !Number.isInteger(imageWidth) ||
    !Number.isInteger(imageHeight) ||
    imageWidth < 1 ||
    imageHeight < 1 ||
    pixels.length !== imageWidth * imageHeight * 4 ||
    bounds.x < 0 ||
    bounds.y < 0 ||
    bounds.width < 1 ||
    bounds.height < 1 ||
    bounds.x + bounds.width > imageWidth ||
    bounds.y + bounds.height > imageHeight
  ) {
    throw new RangeError("Invalid image dimensions or foreground bounds.");
  }

  let count = 0;
  let sumX = 0;
  let sumY = 0;
  for (let y = bounds.y; y < bounds.y + bounds.height; y++) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x++) {
      if (pixels[(y * imageWidth + x) * 4 + 3] < 128) continue;
      count++;
      sumX += x;
      sumY += y;
    }
  }
  if (count < 2) return 0;

  const meanX = sumX / count;
  const meanY = sumY / count;
  let covarianceXX = 0;
  let covarianceYY = 0;
  let covarianceXY = 0;
  for (let y = bounds.y; y < bounds.y + bounds.height; y++) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x++) {
      if (pixels[(y * imageWidth + x) * 4 + 3] < 128) continue;
      const dx = x - meanX;
      const dy = y - meanY;
      covarianceXX += dx * dx;
      covarianceYY += dy * dy;
      covarianceXY += dx * dy;
    }
  }

  let angle = 0.5 * Math.atan2(
    2 * covarianceXY,
    covarianceXX - covarianceYY,
  );
  if (angle > Math.PI / 4) angle -= Math.PI / 2;
  if (angle < -Math.PI / 4) angle += Math.PI / 2;
  return angle;
}

export function findLargestForegroundBounds(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): ImageBounds | null {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    pixels.length !== width * height * 4
  ) {
    throw new RangeError("Invalid image dimensions or pixel data.");
  }

  const visited = new Uint8Array(width * height);
  const spans: number[] = [];
  let largestArea = 0;
  let largestBounds: ImageBounds | null = null;

  const isForeground = (pixelIndex: number) =>
    pixels[pixelIndex * 4 + 3] > 0;

  const visitRun = (y: number, seedX: number) => {
    let left = seedX;
    let right = seedX;
    let pixelIndex = y * width + seedX;

    while (left > 0 && !visited[pixelIndex - 1] && isForeground(pixelIndex - 1)) {
      left--;
      pixelIndex--;
    }
    while (
      right < width - 1 &&
      !visited[pixelIndex + right - left + 1] &&
      isForeground(pixelIndex + right - left + 1)
    ) {
      right++;
    }

    for (let x = left; x <= right; x++) {
      visited[y * width + x] = 1;
    }
    spans.push(y, left, right);
    return right - left + 1;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const seedIndex = y * width + x;
      if (visited[seedIndex] || !isForeground(seedIndex)) continue;

      let area = visitRun(y, x);
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;

      while (spans.length > 0) {
        const right = spans.pop()!;
        const left = spans.pop()!;
        const currentY = spans.pop()!;
        minX = Math.min(minX, left);
        maxX = Math.max(maxX, right);
        minY = Math.min(minY, currentY);
        maxY = Math.max(maxY, currentY);

        for (const nextY of [currentY - 1, currentY + 1]) {
          if (nextY < 0 || nextY >= height) continue;

          let nextX = Math.max(0, left - 1);
          const endX = Math.min(width - 1, right + 1);
          while (nextX <= endX) {
            const nextIndex = nextY * width + nextX;
            if (visited[nextIndex] || !isForeground(nextIndex)) {
              nextX++;
              continue;
            }

            const runRight = nextX;
            area += visitRun(nextY, nextX);
            nextX = runRight + 1;
          }
        }
      }

      if (area > largestArea) {
        largestArea = area;
        largestBounds = {
          x: minX,
          y: minY,
          width: maxX - minX + 1,
          height: maxY - minY + 1,
        };
      }
    }
  }

  return largestBounds;
}

function solveLinearSystem(matrix: number[][], values: number[]) {
  const augmented = matrix.map((row, index) => [...row, values[index]]);
  for (let column = 0; column < values.length; column++) {
    let pivotRow = column;
    for (let row = column + 1; row < values.length; row++) {
      if (
        Math.abs(augmented[row][column]) >
        Math.abs(augmented[pivotRow][column])
      ) {
        pivotRow = row;
      }
    }
    [augmented[column], augmented[pivotRow]] = [
      augmented[pivotRow],
      augmented[column],
    ];
    const pivot = augmented[column][column];
    if (Math.abs(pivot) < 1e-10) return null;

    for (let entry = column; entry <= values.length; entry++) {
      augmented[column][entry] /= pivot;
    }
    for (let row = 0; row < values.length; row++) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let entry = column; entry <= values.length; entry++) {
        augmented[row][entry] -= factor * augmented[column][entry];
      }
    }
  }
  return augmented.map((row) => row[values.length]);
}

function warpDocument(
  source: ImageData,
  corners: DocumentQuad,
): ImageData {
  const { topLeft, topRight, bottomRight, bottomLeft } = corners;
  const distance = (first: { x: number; y: number }, second: { x: number; y: number }) =>
    Math.hypot(first.x - second.x, first.y - second.y);
  const width = Math.max(
    1,
    Math.round(
      (distance(topLeft, topRight) + distance(bottomLeft, bottomRight)) / 2,
    ),
  );
  const height = Math.max(
    1,
    Math.round(
      (distance(topLeft, bottomLeft) + distance(topRight, bottomRight)) / 2,
    ),
  );
  const destinationCorners = [
    { x: 0, y: 0 },
    { x: width - 1, y: 0 },
    { x: width - 1, y: height - 1 },
    { x: 0, y: height - 1 },
  ];
  const sourceCorners = [topLeft, topRight, bottomRight, bottomLeft];
  const matrix: number[][] = [];
  const values: number[] = [];
  for (let index = 0; index < destinationCorners.length; index++) {
    const { x: u, y: v } = destinationCorners[index];
    const { x, y } = sourceCorners[index];
    matrix.push([u, v, 1, 0, 0, 0, -x * u, -x * v]);
    values.push(x);
    matrix.push([0, 0, 0, u, v, 1, -y * u, -y * v]);
    values.push(y);
  }
  const transform = solveLinearSystem(matrix, values);
  if (!transform) throw new Error("Could not straighten the scanned document.");

  const [a, b, c, d, e, f, g, h] = transform;
  const result = new ImageData(width, height);
  const sourcePixels = source.data;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const denominator = g * x + h * y + 1;
      if (Math.abs(denominator) < 1e-10) continue;
      const sourceX = (a * x + b * y + c) / denominator;
      const sourceY = (d * x + e * y + f) / denominator;
      if (
        sourceX < 0 ||
        sourceY < 0 ||
        sourceX > source.width - 1 ||
        sourceY > source.height - 1
      ) {
        continue;
      }

      const x0 = Math.floor(sourceX);
      const y0 = Math.floor(sourceY);
      const x1 = Math.min(x0 + 1, source.width - 1);
      const y1 = Math.min(y0 + 1, source.height - 1);
      const xWeight = sourceX - x0;
      const yWeight = sourceY - y0;
      const outputOffset = (y * width + x) * 4;
      const offsets = [
        (y0 * source.width + x0) * 4,
        (y0 * source.width + x1) * 4,
        (y1 * source.width + x0) * 4,
        (y1 * source.width + x1) * 4,
      ];
      for (let channel = 0; channel < 4; channel++) {
        const top =
          sourcePixels[offsets[0] + channel] * (1 - xWeight) +
          sourcePixels[offsets[1] + channel] * xWeight;
        const bottom =
          sourcePixels[offsets[2] + channel] * (1 - xWeight) +
          sourcePixels[offsets[3] + channel] * xWeight;
        result.data[outputOffset + channel] =
          top * (1 - yWeight) + bottom * yWeight;
      }
    }
  }
  return result;
}

export async function processScannedDocument(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    const analysisScale = Math.min(
      1,
      1000 / Math.max(bitmap.width, bitmap.height),
    );
    const analysisCanvas = document.createElement("canvas");
    analysisCanvas.width = Math.max(1, Math.round(bitmap.width * analysisScale));
    analysisCanvas.height = Math.max(1, Math.round(bitmap.height * analysisScale));
    const analysisContext = analysisCanvas.getContext("2d", {
      willReadFrequently: true,
    });
    if (!analysisContext) {
      throw new Error("Could not analyze the scanned image.");
    }
    analysisContext.drawImage(
      bitmap,
      0,
      0,
      analysisCanvas.width,
      analysisCanvas.height,
    );
    const analysisImage = analysisContext.getImageData(
      0,
      0,
      analysisCanvas.width,
      analysisCanvas.height,
    );
    const detected = detectDocument(
      analysisImage.data,
      analysisImage.width,
      analysisImage.height,
    );
    if (!detected) {
      throw new Error(
        "Could not confidently detect a document. Place it against a contrasting scanner bed and try again.",
      );
    }

    const scaleX = bitmap.width / analysisCanvas.width;
    const scaleY = bitmap.height / analysisCanvas.height;
    const scalePoint = (point: { x: number; y: number }) => ({
      x: point.x * scaleX,
      y: point.y * scaleY,
    });
    const sourceCorners: DocumentQuad = {
      topLeft: scalePoint(detected.corners.topLeft),
      topRight: scalePoint(detected.corners.topRight),
      bottomRight: scalePoint(detected.corners.bottomRight),
      bottomLeft: scalePoint(detected.corners.bottomLeft),
    };

    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = bitmap.width;
    sourceCanvas.height = bitmap.height;
    const sourceContext = sourceCanvas.getContext("2d", {
      willReadFrequently: true,
    });
    if (!sourceContext) {
      throw new Error("Could not prepare the scanned image.");
    }
    sourceContext.drawImage(bitmap, 0, 0);
    const sourceImage = sourceContext.getImageData(
      0,
      0,
      sourceCanvas.width,
      sourceCanvas.height,
    );
    const rectifiedImage = warpDocument(sourceImage, sourceCorners);
    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = rectifiedImage.width;
    outputCanvas.height = rectifiedImage.height;
    const outputContext = outputCanvas.getContext("2d");
    if (!outputContext) {
      throw new Error("Could not prepare the straightened document.");
    }
    outputContext.putImageData(rectifiedImage, 0, 0);

    const blob = await new Promise<Blob>((resolve, reject) => {
      outputCanvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error("Could not export the processed scan."));
      }, "image/png");
    });

    return new File([blob], file.name.replace(/\.[^.]+$/, ".png"), {
      type: "image/png",
    });
  } finally {
    bitmap.close();
  }
}
