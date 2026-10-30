export const MAX_IMAGE_DIMENSION = 20_000;
export const MAX_IMAGE_PIXELS = 40_000_000;

export interface CropSelection {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CropBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function getAspectDimension(
  sourceWidth: number,
  sourceHeight: number,
  changedDimension: "width" | "height",
  value: number,
): number {
  if (
    !Number.isSafeInteger(sourceWidth) ||
    !Number.isSafeInteger(sourceHeight) ||
    sourceWidth <= 0 ||
    sourceHeight <= 0 ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new RangeError("Image dimensions must be positive whole numbers.");
  }
  return changedDimension === "width"
    ? Math.max(1, Math.round((value * sourceHeight) / sourceWidth))
    : Math.max(1, Math.round((value * sourceWidth) / sourceHeight));
}

export function validateOutputDimensions(
  width: number,
  height: number,
): { width: number; height: number } {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > MAX_IMAGE_DIMENSION ||
    height > MAX_IMAGE_DIMENSION
  ) {
    throw new RangeError(
      `Image dimensions must be whole numbers between 1 and ${MAX_IMAGE_DIMENSION.toLocaleString()} pixels.`,
    );
  }
  if (width * height > MAX_IMAGE_PIXELS) {
    throw new RangeError(
      `The output exceeds the ${MAX_IMAGE_PIXELS.toLocaleString()} pixel limit. Reduce the image dimensions.`,
    );
  }
  return { width, height };
}

export function getCropBounds(
  selection: CropSelection,
  imageWidth: number,
  imageHeight: number,
): CropBounds {
  if (
    !Number.isSafeInteger(imageWidth) ||
    !Number.isSafeInteger(imageHeight) ||
    imageWidth < 1 ||
    imageHeight < 1 ||
    !Number.isFinite(selection.x) ||
    !Number.isFinite(selection.y) ||
    !Number.isFinite(selection.width) ||
    !Number.isFinite(selection.height) ||
    selection.width <= 0 ||
    selection.height <= 0
  ) {
    throw new RangeError("Select an area of the image to crop.");
  }

  const left = Math.max(0, Math.min(1, selection.x));
  const top = Math.max(0, Math.min(1, selection.y));
  const right = Math.max(left, Math.min(1, selection.x + selection.width));
  const bottom = Math.max(top, Math.min(1, selection.y + selection.height));
  const x = Math.floor(left * imageWidth);
  const y = Math.floor(top * imageHeight);
  const width = Math.min(imageWidth - x, Math.round((right - left) * imageWidth));
  const height = Math.min(imageHeight - y, Math.round((bottom - top) * imageHeight));

  if (width < 1 || height < 1) {
    throw new RangeError("Select a larger area of the image to crop.");
  }
  return { x, y, width, height };
}
