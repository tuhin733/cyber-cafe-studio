import { useCallback, useEffect, useRef, useState } from "react";
import {
  Crop,
  Wand2,
  RotateCw,
  RotateCcw,
  FlipHorizontal,
  FlipVertical,
  CheckCheck,
  Check,
  RefreshCw,
  Sun,
  Contrast,
  Droplets,
  Sliders,
  Type,
  CircleDot,
  ZoomIn,
  ZoomOut,
  Scan,
} from "lucide-react";
import type { UploadedDoc } from "../types";
import { notifyUserError } from "../lib/userErrors";

export type FilterId =
  | "none"
  | "auto-enhance"
  | "grayscale-scan"
  | "bw-photocopy";

export interface EditResult {
  file: File;
  url: string;
  pxW: number;
  pxH: number;
}

const PREVIEW_MAX_DIMENSION = 1200;

interface FineAdjustments {
  brightness: number;
  contrast: number;
  saturation: number;
}

interface SavedAdjustmentPreset {
  id: string;
  name: string;
  adjustments: FineAdjustments;
}

const DEFAULT_FINE_ADJUSTMENTS: FineAdjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
};

const SAVED_PRESETS_KEY = "cyber-cafe-studio-image-adjustment-presets";

function isSavedAdjustmentPreset(value: unknown): value is SavedAdjustmentPreset {
  if (typeof value !== "object" || value === null) return false;
  const preset = value as Record<string, unknown>;
  if (typeof preset.id !== "string" || typeof preset.name !== "string") return false;
  if (typeof preset.adjustments !== "object" || preset.adjustments === null) return false;
  const adjustments = preset.adjustments as Record<string, unknown>;
  return ["brightness", "contrast", "saturation"].every((key) =>
    typeof adjustments[key] === "number" &&
    Number.isFinite(adjustments[key]) &&
    adjustments[key] >= -50 &&
    adjustments[key] <= 50
  );
}

interface Props {
  docs: UploadedDoc[];
  doc: UploadedDoc;
  onSave: (id: string, result: EditResult) => void;
  onSelectDoc: (id: string) => void;
  onApplyToAll: (results: { id: string; result: EditResult }[]) => void;
  onClose: () => void;
}

interface ToneSettings {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  warmth?: number;
}

function applyTone(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  { brightness = 0, contrast = 1, saturation = 1, warmth = 0 }: ToneSettings,
) {
  const imageData = ctx.getImageData(0, 0, w, h);
  const pixels = imageData.data;
  for (let i = 0; i < pixels.length; i += 4) {
    const red = pixels[i];
    const green = pixels[i + 1];
    const blue = pixels[i + 2];
    const gray = 0.299 * red + 0.587 * green + 0.114 * blue;
    pixels[i] = (gray + (red - gray) * saturation - 128) * contrast + 128 + brightness + warmth;
    pixels[i + 1] = (gray + (green - gray) * saturation - 128) * contrast + 128 + brightness;
    pixels[i + 2] = (gray + (blue - gray) * saturation - 128) * contrast + 128 + brightness - warmth;
  }
  ctx.putImageData(imageData, 0, 0);
}

function applyGrayscale(ctx: CanvasRenderingContext2D, w: number, h: number, contrast = 1, brightness = 0) {
  applyTone(ctx, w, h, { saturation: 0, contrast, brightness });
}

function applyDenoise(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const imageData = ctx.getImageData(0, 0, w, h);
  const source = imageData.data;
  const output = new Uint8ClampedArray(source);
  const offsets = [-w * 4 - 4, -w * 4, -w * 4 + 4, -4, 4, w * 4 - 4, w * 4, w * 4 + 4];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const index = (y * w + x) * 4;
      let minLuminance = 255;
      let maxLuminance = 0;
      let red = 0;
      let green = 0;
      let blue = 0;
      for (const offset of offsets) {
        const neighbor = index + offset;
        const luminance = 0.299 * source[neighbor] +
          0.587 * source[neighbor + 1] +
          0.114 * source[neighbor + 2];
        minLuminance = Math.min(minLuminance, luminance);
        maxLuminance = Math.max(maxLuminance, luminance);
        red += source[neighbor] / offsets.length;
        green += source[neighbor + 1] / offsets.length;
        blue += source[neighbor + 2] / offsets.length;
      }
      const centerLuminance = 0.299 * source[index] +
        0.587 * source[index + 1] +
        0.114 * source[index + 2];
      const averageLuminance = 0.299 * red + 0.587 * green + 0.114 * blue;
      if (maxLuminance - minLuminance < 40 && Math.abs(centerLuminance - averageLuminance) > 18) {
        output[index] = source[index] * 0.55 + red * 0.45;
        output[index + 1] = source[index + 1] * 0.55 + green * 0.45;
        output[index + 2] = source[index + 2] * 0.55 + blue * 0.45;
      }
    }
  }
  ctx.putImageData(new ImageData(output, w, h), 0, 0);
}

function applyShadowRemoval(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  whitenBackground = false,
) {
  const imageData = ctx.getImageData(0, 0, w, h);
  const pixels = imageData.data;
  const lift = whitenBackground ? 0.32 : 0.18;
  for (let i = 0; i < pixels.length; i += 4) {
    for (let channel = 0; channel < 3; channel++) {
      const value = pixels[i + channel];
      const normalized = value / 255;
      pixels[i + channel] = value + (255 - value) * lift * normalized * normalized;
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

function applyAutoContrast(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const imageData = ctx.getImageData(0, 0, w, h);
  const pixels = imageData.data;
  const histogram = new Uint32Array(256);
  for (let i = 0; i < pixels.length; i += 4) {
    const gray = Math.round(0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]);
    histogram[gray]++;
  }

  const total = pixels.length / 4;
  const clipCount = Math.floor(total * 0.005);
  let low = 0;
  let high = 255;
  let cumulative = 0;
  for (; low < 255; low++) {
    cumulative += histogram[low];
    if (cumulative > clipCount) break;
  }
  cumulative = 0;
  for (; high > 0; high--) {
    cumulative += histogram[high];
    if (cumulative > clipCount) break;
  }
  if (high <= low) return;
  const range = high - low;
  for (let i = 0; i < pixels.length; i += 4) {
    const luminance = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
    const adjusted = Math.max(0, Math.min(255, (luminance - low) * 255 / range));
    const change = adjusted - luminance;
    pixels[i] += change;
    pixels[i + 1] += change;
    pixels[i + 2] += change;
  }
  ctx.putImageData(imageData, 0, 0);
}

function applyPaperWhitening(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const imageData = ctx.getImageData(0, 0, w, h);
  const pixels = imageData.data;
  for (let i = 0; i < pixels.length; i += 4) {
    const gray = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
    const amount = Math.max(0, Math.min(1, (gray - 170) / 75));
    const smoothAmount = amount * amount * (3 - 2 * amount);
    const whitened = gray + (255 - gray) * 0.9 * smoothAmount;
    pixels[i] = whitened;
    pixels[i + 1] = whitened;
    pixels[i + 2] = whitened;
  }
  ctx.putImageData(imageData, 0, 0);
}

function applyPhotocopyEnhancement(ctx: CanvasRenderingContext2D, w: number, h: number) {
  applyShadowRemoval(ctx, w, h);
  applyGrayscale(ctx, w, h);
  applyAutoContrast(ctx, w, h);
  applySharpen(ctx, w, h, 0.24);
  applyPaperWhitening(ctx, w, h);
}

function applySharpen(ctx: CanvasRenderingContext2D, w: number, h: number, strength = 0.3) {
  const imageData = ctx.getImageData(0, 0, w, h);
  const source = imageData.data;
  const output = new Uint8ClampedArray(source);
  const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const index = (y * w + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        let sum = 0;
        let min = 255;
        let max = 0;
        let kernelIndex = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const neighbor = ((y + dy) * w + x + dx) * 4 + channel;
            const value = source[neighbor];
            min = Math.min(min, value);
            max = Math.max(max, value);
            sum += value * kernel[kernelIndex++];
          }
        }
        const sharpened = source[index + channel] +
          (sum - source[index + channel]) * strength;
        output[index + channel] = Math.max(min, Math.min(max, sharpened));
      }
    }
  }
  ctx.putImageData(new ImageData(output, w, h), 0, 0);
}

const FILTERS: {
  id: FilterId;
  label: string;
  desc: string;
  icon: React.ReactNode;
  apply: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
}[] = [
  {
    id: "none",
    label: "Original",
    desc: "No change",
    icon: <CircleDot className="h-4 w-4" />,
    apply: () => {},
  },
  {
    id: "auto-enhance",
    label: "Auto Enhance",
    desc: "Denoise, remove shadows, balance contrast, and gently sharpen",
    icon: <Sun className="h-4 w-4" />,
    apply: (ctx, w, h) => {
      applyDenoise(ctx, w, h);
      applyShadowRemoval(ctx, w, h);
      applyAutoContrast(ctx, w, h);
      applySharpen(ctx, w, h, 0.25);
    },
  },
  {
    id: "grayscale-scan",
    label: "Grayscale",
    desc: "Grayscale with shadow removal, contrast, and sharpening",
    icon: <Contrast className="h-4 w-4" />,
    apply: (ctx, w, h) => {
      applyShadowRemoval(ctx, w, h);
      applyGrayscale(ctx, w, h);
      applyAutoContrast(ctx, w, h);
      applySharpen(ctx, w, h, 0.3);
    },
  },
  {
    id: "bw-photocopy",
    label: "B&W Photocopy",
    desc: "Grayscale detail with enhanced text and a cleaner white paper background",
    icon: <Type className="h-4 w-4" />,
    apply: applyPhotocopyEnhancement,
  },
];

interface Pt { x: number; y: number; }
interface Quad { tl: Pt; tr: Pt; br: Pt; bl: Pt; }

function quadToSvgPoints(q: Quad): string {
  return `${q.tl.x},${q.tl.y} ${q.tr.x},${q.tr.y} ${q.br.x},${q.br.y} ${q.bl.x},${q.bl.y}`;
}

function isValidQuad(quad: Quad): boolean {
  const points = [quad.tl, quad.tr, quad.br, quad.bl];
  let direction = 0;

  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const c = points[(i + 2) % points.length];
    const cross =
      (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-6) return false;
    if (direction !== 0 && Math.sign(cross) !== direction) return false;
    direction = Math.sign(cross);
  }

  return true;
}

function solveLinearSystem(A: number[][], B: number[]): number[] | null {
  const n = B.length;
  const aug = A.map((row, i) => [...row, B[i]]);

  for (let col = 0; col < n; col++) {
    // Partial pivoting
    let maxRow = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(aug[r][col]) > Math.abs(aug[maxRow][col])) maxRow = r;
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];

    const pivot = aug[col][col];
    if (Math.abs(pivot) < 1e-10) return null;

    for (let r = col + 1; r < n; r++) {
      const factor = aug[r][col] / pivot;
      for (let c = col; c <= n; c++) {
        aug[r][c] -= factor * aug[col][c];
      }
    }
  }

  // Back-substitution
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = aug[i][n];
    for (let j = i + 1; j < n; j++) {
      sum -= aug[i][j] * x[j];
    }
    x[i] = sum / aug[i][i];
  }
  return x;
}

/**
 * Apply perspective transform: for each pixel in the output
 * rectangle, find the corresponding source pixel via the
 * inverse homography and sample it.
 */
function applyPerspectiveTransform(
  sourceCanvas: HTMLCanvasElement,
  srcQuad: Quad,
  outW: number,
  outH: number,
): HTMLCanvasElement {
  const sCtx = sourceCanvas.getContext("2d");
  if (!sCtx) throw new Error("Image canvas is unavailable.");
  const srcImg = sCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const sW = sourceCanvas.width;
  const sH = sourceCanvas.height;

  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const oCtx = out.getContext("2d");
  if (!oCtx) throw new Error("Crop output canvas is unavailable.");
  const outImg = oCtx.createImageData(outW, outH);
  const od = outImg.data;

  // We need the inverse transform: dst → src
  // The inverse homography is computed below and used directly for sampling.

  // Actually we need dst→src mapping, so set up:
  // src points are the quad, dst points are the rectangle corners.
  // We want: given (dx, dy) in output, find (sx, sy) in source.
  // That's the inverse homography: map rectangle → quad.
  const inv = computePerspectiveRectToQuad(
    outW, outH,
    srcQuad,
  );

  if (!inv) throw new Error("The crop corners do not form a valid shape.");

  const [a, b, c, d, e, f, g, h] = inv;

  for (let dy = 0; dy < outH; dy++) {
    for (let dx = 0; dx < outW; dx++) {
      const denom = g * dx + h * dy + 1;
      if (Math.abs(denom) < 1e-10) continue;
      const sx = (a * dx + b * dy + c) / denom;
      const sy = (d * dx + e * dy + f) / denom;

      // Bilinear sampling
      const sx0 = Math.floor(sx);
      const sy0 = Math.floor(sy);
      const fx = sx - sx0;
      const fy = sy - sy0;

      const sx1 = Math.min(sx0 + 1, sW - 1);
      const sy1 = Math.min(sy0 + 1, sH - 1);

      if (sx0 < 0 || sy0 < 0 || sx0 >= sW || sy0 >= sH) {
        // Out of bounds — set transparent/black
        const oi = (dy * outW + dx) * 4;
        od[oi] = 255; od[oi + 1] = 255; od[oi + 2] = 255; od[oi + 3] = 255;
        continue;
      }

      const i00 = (sy0 * sW + sx0) * 4;
      const i10 = (sy0 * sW + sx1) * 4;
      const i01 = (sy1 * sW + sx0) * 4;
      const i11 = (sy1 * sW + sx1) * 4;

      const oi = (dy * outW + dx) * 4;
      for (let ch = 0; ch < 4; ch++) {
        const top = srcImg.data[i00 + ch] * (1 - fx) + srcImg.data[i10 + ch] * fx;
        const bot = srcImg.data[i01 + ch] * (1 - fx) + srcImg.data[i11 + ch] * fx;
        od[oi + ch] = top * (1 - fy) + bot * fy;
      }
    }
  }

  oCtx.putImageData(outImg, 0, 0);
  return out;
}

/**
 * Compute homography that maps a rectangle (0,0)-(dstW,dstH)
 * to an arbitrary source quad. This is the inverse mapping
 * needed for backward warping.
 */
function computePerspectiveRectToQuad(
  dstW: number,
  dstH: number,
  quad: Quad,
): number[] | null {
  // We want to map dst rectangle corners → quad corners
  // dst corners: (0,0), (dstW,0), (dstW,dstH), (0,dstH)
  // src corners: quad.tl, quad.tr, quad.br, quad.bl
  // System: for each corner i:
  //   dx*a + dy*b + c - sx*(dx*g + dy*h + 1) = 0  → sx = (dx*a+dy*b+c)/(dx*g+dy*h+1)
  //   dx*d + dy*e + f - sy*(dx*g + dy*h + 1) = 0  → sy = (dx*d+dy*e+f)/(dx*g+dy*h+1)
  // Rearranged:
  //   dx*a + dy*b + c - sx*dx*g - sx*dy*h = sx
  //   dx*d + dy*e + f - sy*dx*g - sy*dy*h = sy

  const dxs = [0, dstW, dstW, 0];
  const dys = [0, 0, dstH, dstH];
  const sxs = [quad.tl.x, quad.tr.x, quad.br.x, quad.bl.x];
  const sys = [quad.tl.y, quad.tr.y, quad.br.y, quad.bl.y];

  const A: number[][] = [];
  const B: number[] = [];
  for (let i = 0; i < 4; i++) {
    A.push([dxs[i], dys[i], 1, 0, 0, 0, -sxs[i] * dxs[i], -sxs[i] * dys[i]]);
    B.push(sxs[i]);
    A.push([0, 0, 0, dxs[i], dys[i], 1, -sys[i] * dxs[i], -sys[i] * dys[i]]);
    B.push(sys[i]);
  }
  return solveLinearSystem(A, B);
}

type CornerKey = "tl" | "tr" | "br" | "bl";
type EdgeKey = "top" | "right" | "bottom" | "left";

function getEdgeMidpoint(quad: Quad, edge: EdgeKey): Pt {
  switch (edge) {
    case "top":
      return {
        x: (quad.tl.x + quad.tr.x) / 2,
        y: (quad.tl.y + quad.tr.y) / 2,
      };
    case "right":
      return {
        x: (quad.tr.x + quad.br.x) / 2,
        y: (quad.tr.y + quad.br.y) / 2,
      };
    case "bottom":
      return {
        x: (quad.bl.x + quad.br.x) / 2,
        y: (quad.bl.y + quad.br.y) / 2,
      };
    case "left":
      return {
        x: (quad.tl.x + quad.bl.x) / 2,
        y: (quad.tl.y + quad.bl.y) / 2,
      };
  }
}

function getEdgeAngle(quad: Quad, edge: EdgeKey): number {
  let start: Pt;
  let end: Pt;
  switch (edge) {
    case "top":
      start = quad.tl;
      end = quad.tr;
      break;
    case "right":
      start = quad.tr;
      end = quad.br;
      break;
    case "bottom":
      start = quad.bl;
      end = quad.br;
      break;
    case "left":
      start = quad.tl;
      end = quad.bl;
      break;
  }
  return Math.atan2(end.y - start.y, end.x - start.x) * (180 / Math.PI);
}

export default function ImageEditor({
  docs,
  doc,
  onSave,
  onSelectDoc,
  onApplyToAll,
  onClose,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<FilterId>("none");
  const [fineTuneOpen, setFineTuneOpen] = useState(true);
  const [filterAdjustments, setFilterAdjustments] =
    useState<Partial<Record<FilterId, FineAdjustments>>>({});
  const [savedPresets, setSavedPresets] = useState<SavedAdjustmentPreset[]>([]);
  const [savedPresetName, setSavedPresetName] = useState("");
  const [savedPresetsLoaded, setSavedPresetsLoaded] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applyingToAll, setApplyingToAll] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [activeCropHandle, setActiveCropHandle] = useState<CornerKey | EdgeKey | null>(null);
  const [magnifierPoint, setMagnifierPoint] = useState<{
    x: number;
    y: number;
    clientX: number;
    clientY: number;
  } | null>(null);
  const previewAreaRef = useRef<HTMLDivElement>(null);
  const controlsScrollRef = useRef<HTMLDivElement>(null);
  const [controlsScrollEdges, setControlsScrollEdges] = useState({
    top: false,
    bottom: false,
  });
  const magnifierCanvasRef = useRef<HTMLCanvasElement>(null);
  const [previewBounds, setPreviewBounds] = useState({ width: 0, height: 0 });

  useEffect(() => {
    try {
      const storedPresets = localStorage.getItem(SAVED_PRESETS_KEY);
      if (storedPresets) {
        const parsed: unknown = JSON.parse(storedPresets);
        if (!Array.isArray(parsed) || !parsed.every(isSavedAdjustmentPreset)) {
          throw new Error("Saved adjustment presets have an invalid format.");
        }
        setSavedPresets(parsed);
      }
    } catch (error) {
      console.error("Failed to load saved image adjustment presets:", error);
      notifyUserError("Saved image presets couldn't be loaded.");
    } finally {
      setSavedPresetsLoaded(true);
    }
  }, []);

  useEffect(() => {
    const scrollArea = controlsScrollRef.current;
    const content = scrollArea?.firstElementChild;
    if (!scrollArea || !content) return;

    const updateScrollEdges = () => {
      const maxScrollTop = scrollArea.scrollHeight - scrollArea.clientHeight;
      setControlsScrollEdges({
        top: scrollArea.scrollTop > 1,
        bottom: maxScrollTop - scrollArea.scrollTop > 1,
      });
    };

    updateScrollEdges();
    const resizeObserver = new ResizeObserver(updateScrollEdges);
    resizeObserver.observe(scrollArea);
    resizeObserver.observe(content);
    window.addEventListener("resize", updateScrollEdges);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateScrollEdges);
    };
  }, []);

  useEffect(() => {
    const { body, documentElement } = document;
    const previousBodyOverflow = body.style.overflow;
    const previousRootOverflow = documentElement.style.overflow;

    body.style.overflow = "hidden";
    documentElement.style.overflow = "hidden";

    return () => {
      body.style.overflow = previousBodyOverflow;
      documentElement.style.overflow = previousRootOverflow;
    };
  }, []);

  // Crop state — 4-point perspective
  const [cropMode, setCropMode] = useState(false);
  const [quad, setQuad] = useState<Quad | null>(null);
  const [cropPreset, setCropPreset] = useState("Free");
  const draggingCorner = useRef<CornerKey | null>(null);
  const draggingEdge = useRef<EdgeKey | null>(null);
  const draggingCrop = useRef(false);
  const dragOrigin = useRef<{ quad: Quad; x: number; y: number } | null>(null);

  const DISPLAY_LIMIT = 600;
  const activeAdjustments = filterAdjustments[filter] ?? DEFAULT_FINE_ADJUSTMENTS;
  const hasFilterChanges = filter !== "none" ||
    activeAdjustments.brightness !== 0 ||
    activeAdjustments.contrast !== 0 ||
    activeAdjustments.saturation !== 0;
  const hasEdits = hasFilterChanges ||
    rotation !== 0 ||
    flipH ||
    flipV ||
    cropMode;

  const updateFilterAdjustment = (key: keyof FineAdjustments, value: number) => {
    setFilterAdjustments((previous) => ({
      ...previous,
      [filter]: {
        ...(previous[filter] ?? DEFAULT_FINE_ADJUSTMENTS),
        [key]: value,
      },
    }));
  };

  useEffect(() => {
    let active = true;
    const img = new Image();
    img.onload = () => {
      if (!active) return;
      imgRef.current = img;
      setLoaded(true);
    };
    img.onerror = () => {
      if (active) {
        setImageLoadFailed(true);
        notifyUserError("This image couldn't be opened.");
      }
    };
    setLoaded(false);
    setImageLoadFailed(false);
    imgRef.current = null;
    img.src = doc.url;
    return () => {
      active = false;
    };
  }, [doc.url]);

  useEffect(() => {
    const area = previewAreaRef.current;
    if (!area) return;
    const observer = new ResizeObserver(([entry]) => {
      setPreviewBounds({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(area);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, saving]);

  const renderImage = useCallback((canvas: HTMLCanvasElement, maxDimension?: number) => {
    const img = imgRef.current;
    if (!img) return;

    const rot = rotation;
    const radians = (rot * Math.PI) / 180;
    const baseW = img.naturalWidth;
    const baseH = img.naturalHeight;
    const fullW = Math.ceil(Math.abs(baseW * Math.cos(radians)) + Math.abs(baseH * Math.sin(radians)));
    const fullH = Math.ceil(Math.abs(baseH * Math.cos(radians)) + Math.abs(baseW * Math.sin(radians)));
    const scale = maxDimension
      ? Math.min(1, maxDimension / Math.max(fullW, fullH))
      : 1;
    const cw = Math.max(1, Math.ceil(fullW * scale));
    const ch = Math.max(1, Math.ceil(fullH * scale));

    canvas.width = cw;
    canvas.height = ch;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const filterParts: string[] = [];
    if (activeAdjustments.brightness !== 0)
      filterParts.push(`brightness(${100 + activeAdjustments.brightness}%)`);
    if (activeAdjustments.contrast !== 0)
      filterParts.push(`contrast(${100 + activeAdjustments.contrast}%)`);
    if (activeAdjustments.saturation !== 0)
      filterParts.push(`saturate(${100 + activeAdjustments.saturation}%)`);

    ctx.save();
    ctx.filter = filterParts.length ? filterParts.join(" ") : "none";
    ctx.translate(cw / 2, ch / 2);
    ctx.scale(scale, scale);
    ctx.rotate(radians);
    if (flipH) ctx.scale(-1, 1);
    if (flipV) ctx.scale(1, -1);
    ctx.drawImage(img, -baseW / 2, -baseH / 2);
    ctx.restore();
    ctx.filter = "none";

    const filterDef = FILTERS.find((f) => f.id === filter);
    if (filterDef && filter !== "none") {
      filterDef.apply(ctx, canvas.width, canvas.height);
    }
  }, [
    rotation,
    flipH,
    flipV,
    filter,
    activeAdjustments.brightness,
    activeAdjustments.contrast,
    activeAdjustments.saturation,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (loaded && canvas) renderImage(canvas, PREVIEW_MAX_DIMENSION);
  }, [loaded, renderImage]);

  const rotatedDimensions = (() => {
    const img = imgRef.current;
    if (!img) return { width: DISPLAY_LIMIT, height: 400 };
    const radians = (rotation * Math.PI) / 180;
    const width = Math.ceil(Math.abs(img.naturalWidth * Math.cos(radians)) + Math.abs(img.naturalHeight * Math.sin(radians)));
    const height = Math.ceil(Math.abs(img.naturalHeight * Math.cos(radians)) + Math.abs(img.naturalWidth * Math.sin(radians)));
    const availableWidth = Math.max(1, previewBounds.width - 8);
    const availableHeight = Math.max(1, previewBounds.height - 8);
    const scale = Math.min(
      DISPLAY_LIMIT / width,
      DISPLAY_LIMIT / height,
      availableWidth / width,
      availableHeight / height,
      1,
    );
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
  })();
  const displayW = rotatedDimensions.width;
  const displayH = rotatedDimensions.height;
  const zoomedW = displayW * zoom;
  const zoomedH = displayH * zoom;

  const resetAll = () => {
    setFilter("none");
    setFineTuneOpen(true);
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setFilterAdjustments({});
    setCropMode(false);
    setQuad(null);
    setCropPreset("Free");
  };

  const handleSave = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaving(true);

    try {
      const exportCanvas = document.createElement("canvas");
      renderImage(exportCanvas);
      let finalCanvas: HTMLCanvasElement = exportCanvas;

      if (cropMode && quad) {
        if (!isValidQuad(quad)) {
          throw new Error("Move the crop corners so they form a convex shape.");
        }

        const srcQuad: Quad = {
          tl: { x: quad.tl.x * exportCanvas.width / displayW, y: quad.tl.y * exportCanvas.height / displayH },
          tr: { x: quad.tr.x * exportCanvas.width / displayW, y: quad.tr.y * exportCanvas.height / displayH },
          br: { x: quad.br.x * exportCanvas.width / displayW, y: quad.br.y * exportCanvas.height / displayH },
          bl: { x: quad.bl.x * exportCanvas.width / displayW, y: quad.bl.y * exportCanvas.height / displayH },
        };

        const topEdge = Math.hypot(srcQuad.tr.x - srcQuad.tl.x, srcQuad.tr.y - srcQuad.tl.y);
        const bottomEdge = Math.hypot(srcQuad.br.x - srcQuad.bl.x, srcQuad.br.y - srcQuad.bl.y);
        const leftEdge = Math.hypot(srcQuad.bl.x - srcQuad.tl.x, srcQuad.bl.y - srcQuad.tl.y);
        const rightEdge = Math.hypot(srcQuad.br.x - srcQuad.tr.x, srcQuad.br.y - srcQuad.tr.y);
        const outW = Math.round(Math.max(topEdge, bottomEdge));
        const outH = Math.round(Math.max(leftEdge, rightEdge));

        if (outW < 1 || outH < 1) {
          throw new Error("The selected crop area is too small.");
        }
        finalCanvas = applyPerspectiveTransform(exportCanvas, srcQuad, outW, outH);
      }

      const mimeType = "image/png";
      const blob: Blob | null = await new Promise((resolve) =>
        finalCanvas.toBlob((result) => resolve(result), mimeType),
      );
      if (!blob) throw new Error("The edited image could not be exported.");

      const baseName = doc.fileName.replace(/\.[^.]+$/, "");
      const file = new File([blob], `edited-${baseName}.png`, {
        type: mimeType,
      });
      const url = URL.createObjectURL(file);
      onSave(doc.id, {
        file,
        url,
        pxW: finalCanvas.width,
        pxH: finalCanvas.height,
      });
      resetAll();
      setZoom(1);
    } catch (error) {
      console.error("Failed to save edited image:", error);
      const details = error instanceof Error ? error.message : "";
      notifyUserError(
        details === "Move the crop corners so they form a convex shape." ||
          details === "The selected crop area is too small."
          ? details
          : "Couldn't save the edited image. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleApplyFilterToAll = async () => {
    const filterDef = FILTERS.find((item) => item.id === filter);
    if (!filterDef) return;

    setSaving(true);
    setApplyingToAll(true);
    const results: { id: string; result: EditResult }[] = [];

    try {
      for (const imageDoc of docs) {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
          const loadedImage = new Image();
          loadedImage.onload = () => resolve(loadedImage);
          loadedImage.onerror = () => reject(
            new Error(`${imageDoc.label} could not be opened.`),
          );
          loadedImage.src = imageDoc.url;
        });
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d");
        if (!context) throw new Error(`Could not process ${imageDoc.label}.`);

        const adjustments = filterAdjustments[filter] ?? DEFAULT_FINE_ADJUSTMENTS;
        const filterParts: string[] = [];
        if (adjustments.brightness !== 0)
          filterParts.push(`brightness(${100 + adjustments.brightness}%)`);
        if (adjustments.contrast !== 0)
          filterParts.push(`contrast(${100 + adjustments.contrast}%)`);
        if (adjustments.saturation !== 0)
          filterParts.push(`saturate(${100 + adjustments.saturation}%)`);
        context.filter = filterParts.length ? filterParts.join(" ") : "none";
        context.drawImage(image, 0, 0);
        context.filter = "none";
        filterDef.apply(context, canvas.width, canvas.height);

        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/png"),
        );
        if (!blob) throw new Error(`${imageDoc.label} could not be exported.`);

        const baseName = imageDoc.fileName.replace(/\.[^.]+$/, "");
        const file = new File([blob], `edited-${baseName}.png`, {
          type: "image/png",
        });
        results.push({
          id: imageDoc.id,
          result: {
            file,
            url: URL.createObjectURL(file),
            pxW: canvas.width,
            pxH: canvas.height,
          },
        });
      }
      onApplyToAll(results);
      setFilter("none");
      setFineTuneOpen(true);
      setFilterAdjustments({});
    } catch (error) {
      for (const { result } of results) URL.revokeObjectURL(result.url);
      console.error("Failed to apply filter to all images:", error);
      notifyUserError("Couldn't apply the filter to all images. Please try again.");
    } finally {
      setSaving(false);
      setApplyingToAll(false);
    }
  };

  const persistSavedPresets = (nextPresets: SavedAdjustmentPreset[]): boolean => {
    try {
      localStorage.setItem(SAVED_PRESETS_KEY, JSON.stringify(nextPresets));
      setSavedPresets(nextPresets);
      return true;
    } catch (error) {
      console.error("Failed to save image adjustment presets:", error);
      notifyUserError("Saved presets couldn't be updated. Check available storage.");
      return false;
    }
  };

  const saveCurrentPreset = () => {
    const name = savedPresetName.trim();
    if (!name) return;
    const saved = persistSavedPresets([
      ...savedPresets,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name,
        adjustments: { ...activeAdjustments },
      },
    ]);
    if (saved) setSavedPresetName("");
  };

  // --- Perspective crop corner dragging ---
  const onCornerPointerDown = (e: React.PointerEvent, corner: CornerKey) => {
    e.stopPropagation();
    e.preventDefault();
    if (!quad) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) * displayW / rect.width;
    const y = (e.clientY - rect.top) * displayH / rect.height;
    const point = quad[corner];
    draggingCorner.current = corner;
    draggingEdge.current = null;
    dragOrigin.current = { quad, x, y };
    setActiveCropHandle(corner);
    setMagnifierPoint({ ...point, clientX: e.clientX, clientY: e.clientY });
  };

  const onEdgePointerDown = (e: React.PointerEvent, edge: EdgeKey) => {
    e.stopPropagation();
    e.preventDefault();
    if (!quad) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) * displayW / rect.width;
    const y = (e.clientY - rect.top) * displayH / rect.height;
    const midpoint = getEdgeMidpoint(quad, edge);
    draggingEdge.current = edge;
    draggingCorner.current = null;
    dragOrigin.current = { quad, x, y };
    setActiveCropHandle(edge);
    setMagnifierPoint({ ...midpoint, clientX: e.clientX, clientY: e.clientY });
  };

  const onCropPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!quad) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) * displayW / rect.width;
    const y = (e.clientY - rect.top) * displayH / rect.height;
    draggingCrop.current = true;
    draggingCorner.current = null;
    draggingEdge.current = null;
    dragOrigin.current = { quad, x, y };
    setActiveCropHandle(null);
    setMagnifierPoint(null);
  };

  useEffect(() => {
    if (!cropMode) return;
    const onMove = (e: PointerEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const origin = dragOrigin.current;
      if (!origin) return;
      const pointerX = (e.clientX - rect.left) * displayW / rect.width;
      const pointerY = (e.clientY - rect.top) * displayH / rect.height;

      if (draggingCrop.current) {
        const deltaX = pointerX - origin.x;
        const deltaY = pointerY - origin.y;
        const points = Object.values(origin.quad);
        const minX = Math.min(...points.map((point) => point.x));
        const maxX = Math.max(...points.map((point) => point.x));
        const minY = Math.min(...points.map((point) => point.y));
        const maxY = Math.max(...points.map((point) => point.y));
        const boundedX = Math.max(-minX, Math.min(displayW - maxX, deltaX));
        const boundedY = Math.max(-minY, Math.min(displayH - maxY, deltaY));
        setQuad({
          tl: { x: origin.quad.tl.x + boundedX, y: origin.quad.tl.y + boundedY },
          tr: { x: origin.quad.tr.x + boundedX, y: origin.quad.tr.y + boundedY },
          br: { x: origin.quad.br.x + boundedX, y: origin.quad.br.y + boundedY },
          bl: { x: origin.quad.bl.x + boundedX, y: origin.quad.bl.y + boundedY },
        });
        return;
      }

      if (draggingCorner.current) {
        const corner = draggingCorner.current;
        const start = origin.quad[corner];
        const x = Math.max(0, Math.min(displayW, start.x + pointerX - origin.x));
        const y = Math.max(0, Math.min(displayH, start.y + pointerY - origin.y));
        setMagnifierPoint({ x, y, clientX: e.clientX, clientY: e.clientY });
        setQuad((prev) => prev ? { ...prev, [corner]: { x, y } } : prev);
        return;
      }

      if (draggingEdge.current) {
        const edge = draggingEdge.current;
        const startQuad = origin.quad;
        let first: Pt;
        let second: Pt;
        switch (edge) {
          case "top":
            first = startQuad.tl;
            second = startQuad.tr;
            break;
          case "right":
            first = startQuad.tr;
            second = startQuad.br;
            break;
          case "bottom":
            first = startQuad.bl;
            second = startQuad.br;
            break;
          case "left":
            first = startQuad.tl;
            second = startQuad.bl;
            break;
        }
        const edgeX = second.x - first.x;
        const edgeY = second.y - first.y;
        const edgeLength = Math.hypot(edgeX, edgeY) || 1;
        const normalX = -edgeY / edgeLength;
        const normalY = edgeX / edgeLength;
        const movementX = pointerX - origin.x;
        const movementY = pointerY - origin.y;
        let distance = movementX * normalX + movementY * normalY;

        for (const point of [first, second]) {
          if (normalX > 0) {
            distance = Math.max(distance, -point.x / normalX);
            distance = Math.min(distance, (displayW - point.x) / normalX);
          } else if (normalX < 0) {
            distance = Math.max(distance, (displayW - point.x) / normalX);
            distance = Math.min(distance, -point.x / normalX);
          }
          if (normalY > 0) {
            distance = Math.max(distance, -point.y / normalY);
            distance = Math.min(distance, (displayH - point.y) / normalY);
          } else if (normalY < 0) {
            distance = Math.max(distance, (displayH - point.y) / normalY);
            distance = Math.min(distance, -point.y / normalY);
          }
        }

        const next = {
          tl: { ...startQuad.tl },
          tr: { ...startQuad.tr },
          br: { ...startQuad.br },
          bl: { ...startQuad.bl },
        };
        const move = (point: Pt): Pt => ({
          x: point.x + normalX * distance,
          y: point.y + normalY * distance,
        });
        switch (edge) {
          case "top":
            next.tl = move(startQuad.tl);
            next.tr = move(startQuad.tr);
            break;
          case "right":
            next.tr = move(startQuad.tr);
            next.br = move(startQuad.br);
            break;
          case "bottom":
            next.bl = move(startQuad.bl);
            next.br = move(startQuad.br);
            break;
          case "left":
            next.tl = move(startQuad.tl);
            next.bl = move(startQuad.bl);
            break;
        }
        const midpoint = getEdgeMidpoint(next, edge);
        setMagnifierPoint({
          ...midpoint,
          clientX: e.clientX,
          clientY: e.clientY,
        });
        setQuad(next);
      }
    };
    const onUp = () => {
      draggingCrop.current = false;
      draggingCorner.current = null;
      draggingEdge.current = null;
      dragOrigin.current = null;
      setActiveCropHandle(null);
      setMagnifierPoint(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [cropMode, displayW, displayH]);

  useEffect(() => {
    const source = canvasRef.current;
    const magnifier = magnifierCanvasRef.current;
    if (!source || !magnifier || !magnifierPoint) return;
    const context = magnifier.getContext("2d");
    if (!context) return;

    const lensSize = magnifier.width;
    const zoomFactor = 3;
    const rect = source.getBoundingClientRect();
    const sourceWidth = Math.min(source.width, (lensSize / zoomFactor) * source.width / rect.width);
    const sourceHeight = Math.min(source.height, (lensSize / zoomFactor) * source.height / rect.height);
    const sourceX = Math.max(0, Math.min(source.width, magnifierPoint.x * source.width / displayW));
    const sourceY = Math.max(0, Math.min(source.height, magnifierPoint.y * source.height / displayH));
    const sx = Math.max(0, Math.min(source.width - sourceWidth, sourceX - sourceWidth / 2));
    const sy = Math.max(0, Math.min(source.height - sourceHeight, sourceY - sourceHeight / 2));
    const targetX = ((sourceX - sx) / sourceWidth) * lensSize;
    const targetY = ((sourceY - sy) / sourceHeight) * lensSize;

    context.clearRect(0, 0, lensSize, lensSize);
    context.drawImage(
      source,
      sx,
      sy,
      Math.min(sourceWidth, source.width),
      Math.min(sourceHeight, source.height),
      0,
      0,
      lensSize,
      lensSize,
    );
    context.strokeStyle = "rgba(13, 148, 136, 0.9)";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(targetX, 0);
    context.lineTo(targetX, lensSize);
    context.moveTo(0, targetY);
    context.lineTo(lensSize, targetY);
    context.stroke();
  }, [magnifierPoint, displayW, displayH, zoom]);

  const previousDisplaySize = useRef({ width: displayW, height: displayH });
  useEffect(() => {
    const previous = previousDisplaySize.current;
    if (cropMode && quad && previous.width > 0 && previous.height > 0 &&
      (previous.width !== displayW || previous.height !== displayH)) {
      const scaleX = displayW / previous.width;
      const scaleY = displayH / previous.height;
      setQuad({
        tl: { x: quad.tl.x * scaleX, y: quad.tl.y * scaleY },
        tr: { x: quad.tr.x * scaleX, y: quad.tr.y * scaleY },
        br: { x: quad.br.x * scaleX, y: quad.br.y * scaleY },
        bl: { x: quad.bl.x * scaleX, y: quad.bl.y * scaleY },
      });
    }
    previousDisplaySize.current = { width: displayW, height: displayH };
  }, [cropMode, quad, displayW, displayH]);

  const applyCropPreset = (label: string, aspect: number | null) => {
    setCropPreset(label);
    if (!aspect) {
      setQuad({
        tl: { x: displayW * 0.05, y: displayH * 0.05 },
        tr: { x: displayW * 0.95, y: displayH * 0.05 },
        br: { x: displayW * 0.95, y: displayH * 0.95 },
        bl: { x: displayW * 0.05, y: displayH * 0.95 },
      });
      return;
    }
    const width = Math.min(displayW * 0.9, displayH * 0.9 * aspect);
    const height = width / aspect;
    const left = (displayW - width) / 2;
    const top = (displayH - height) / 2;
    setQuad({
      tl: { x: left, y: top },
      tr: { x: left + width, y: top },
      br: { x: left + width, y: top + height },
      bl: { x: left, y: top + height },
    });
  };

  const toggleCrop = () => {
    if (cropMode) {
      setCropMode(false);
      setQuad(null);
    } else {
      setCropMode(true);
      applyCropPreset("Free", null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-2 backdrop-blur-sm sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Edit ${doc.label}`}
    >
      <div className="flex h-[95vh] max-h-[95vh] w-full max-w-6xl min-h-0 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-cyan-600 text-white">
              <Wand2 className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">Image Editor</h2>
              <p className="text-[11px] text-slate-400">
                {doc.label} · {doc.pxW}×{doc.pxH}px
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          <aside
            className="flex h-24 shrink-0 gap-2 overflow-x-auto border-b border-slate-200 bg-white p-2 lg:h-auto lg:w-40 lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto lg:border-b-0 lg:border-r"
            aria-label="Images to edit"
          >
            {docs.map((imageDoc, index) => (
              <button
                key={imageDoc.id}
                type="button"
                onClick={() => onSelectDoc(imageDoc.id)}
                disabled={saving}
                aria-pressed={doc.id === imageDoc.id}
                className={`flex w-20 shrink-0 flex-col gap-1 rounded-lg border p-1.5 text-left transition-colors lg:w-full ${
                  doc.id === imageDoc.id
                    ? "border-teal-400 bg-teal-50 ring-1 ring-teal-200"
                    : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                } disabled:cursor-not-allowed disabled:opacity-60`}
                title={imageDoc.label}
              >
                <img
                  src={imageDoc.url}
                  alt=""
                  className="h-12 w-full rounded object-contain lg:h-16"
                />
                <span className="w-full truncate text-[10px] font-medium text-slate-600">
                  {index + 1}. {imageDoc.label}
                </span>
              </button>
            ))}
          </aside>
          {/* Canvas area */}
          <div
            ref={previewAreaRef}
            className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-slate-100"
          >
            <div className="absolute left-3 top-3 z-20 flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white/95 p-0.5 shadow-sm backdrop-blur">
              <button
                type="button"
                onClick={() => setZoom((value) => Math.max(0.5, Math.round((value - 0.25) * 100) / 100))}
                disabled={zoom <= 0.5}
                aria-label="Zoom out"
                title="Zoom out"
                className="flex h-7 w-7 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setZoom(1)}
                aria-label="Reset zoom"
                title="Reset zoom"
                className="flex h-7 w-7 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100"
              >
                <Scan className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setZoom((value) => Math.min(3, Math.round((value + 0.25) * 100) / 100))}
                disabled={zoom >= 3}
                aria-label="Zoom in"
                title="Zoom in"
                className="flex h-7 w-7 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
            </div>
            <div
              className="absolute right-6 top-3 z-20 flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white/95 p-0.5 shadow-sm backdrop-blur"
              role="toolbar"
              aria-label="Image transform controls"
            >
              <CanvasToolButton
                onClick={() => setRotation((value) => (value - 90 + 360) % 360)}
                label="Rotate left"
                icon={<RotateCcw className="h-3.5 w-3.5" />}
              />
              <CanvasToolButton
                onClick={() => setRotation((value) => (value + 90) % 360)}
                label="Rotate right"
                icon={<RotateCw className="h-3.5 w-3.5" />}
              />
              <CanvasToolButton
                onClick={() => setFlipH((value) => !value)}
                label="Flip horizontal"
                icon={<FlipHorizontal className="h-3.5 w-3.5" />}
                active={flipH}
              />
              <CanvasToolButton
                onClick={() => setFlipV((value) => !value)}
                label="Flip vertical"
                icon={<FlipVertical className="h-3.5 w-3.5" />}
                active={flipV}
              />
            </div>
            <div
              className={`absolute inset-0 flex overflow-auto p-2 sm:p-4 lg:p-6 ${
                zoom > 1
                  ? "items-start justify-start pt-14"
                  : "items-center justify-center"
              }`}
            >
            {!loaded && !imageLoadFailed ? (
              <div className="flex items-center gap-2 text-slate-400">
                <RefreshCw className="h-5 w-5 animate-spin" />
                <span className="text-sm">Loading image…</span>
              </div>
            ) : !loaded ? (
              <div className="h-full w-full" aria-hidden="true" />
            ) : (
              <div
                className="relative mx-auto inline-block shrink-0"
                style={{
                  width: zoomedW,
                  height: zoomedH,
                  aspectRatio: `${displayW} / ${displayH}`,
                }}
              >
                <canvas
                  ref={canvasRef}
                  className="block h-full w-full rounded-lg bg-white shadow-lg"
                  style={{
                    aspectRatio: `${displayW} / ${displayH}`,
                  }}
                />
                {/* Perspective crop overlay */}
                {cropMode && quad && (
                  <>
                    {/* Dark mask outside the quad using SVG */}
                    <svg
                      className="pointer-events-none absolute inset-0"
                      width="100%"
                      height="100%"
                      viewBox={`0 0 ${displayW} ${displayH}`}
                      preserveAspectRatio="none"
                    >
                      <defs>
                        <mask id="cropMask">
                          <rect width={displayW} height={displayH} fill="white" />
                          <polygon
                            points={quadToSvgPoints(quad)}
                            fill="black"
                          />
                        </mask>
                      </defs>
                      <rect
                        width={displayW}
                        height={displayH}
                        fill="rgba(15,23,42,0.55)"
                        mask="url(#cropMask)"
                      />
                      <polygon
                        points={quadToSvgPoints(quad)}
                        fill="transparent"
                        pointerEvents="all"
                        className="cursor-move"
                        onPointerDown={onCropPointerDown}
                        aria-label="Move crop area"
                      />
                      {/* Quad outline */}
                      <polygon
                        points={quadToSvgPoints(quad)}
                        fill="none"
                        stroke="#14b8a6"
                        strokeWidth="2"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                    </svg>
                    {/* Mid-edge handles */}
                    {(["top", "right", "bottom", "left"] as EdgeKey[]).map((edge) => {
                      const midpoint = getEdgeMidpoint(quad, edge);
                      const angle = getEdgeAngle(quad, edge);
                      return (
                        <div
                          key={edge}
                          onPointerDown={(e) => onEdgePointerDown(e, edge)}
                          className={`absolute z-10 flex touch-none items-center justify-center ${
                            edge === "top" || edge === "bottom" ? "cursor-ns-resize" : "cursor-ew-resize"
                          }`}
                          style={{
                            left: `${(midpoint.x / displayW) * 100}%`,
                            top: `${(midpoint.y / displayH) * 100}%`,
                            width: 48,
                            height: 18,
                            transform: `translate(-50%, -50%) rotate(${angle}deg)`,
                          }}
                          role="button"
                          aria-label={`Move ${edge} crop edge`}
                        >
                          <span
                            className="block h-1.5 w-8 rounded-full border border-teal-600 bg-white shadow-sm"
                          />
                        </div>
                      );
                    })}
                    {/* Corner handles */}
                    {(["tl", "tr", "br", "bl"] as CornerKey[]).map((key) => (
                      <div
                        key={key}
                        onPointerDown={(e) => onCornerPointerDown(e, key)}
                        className={`absolute z-20 flex h-6 w-6 touch-none items-center justify-center ${
                          key === "tl" || key === "br" ? "cursor-nwse-resize" : "cursor-nesw-resize"
                        }`}
                        style={{
                          left: `${(quad[key].x / displayW) * 100}%`,
                          top: `${(quad[key].y / displayH) * 100}%`,
                          transform: "translate(-50%, -50%)",
                        }}
                        role="button"
                        aria-label={`Move ${key} crop corner`}
                      >
                        <span className="h-3 w-3 rounded-full border border-teal-600 bg-white shadow-sm" />
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
            </div>
            {activeCropHandle && magnifierPoint && (
              <div
                className="pointer-events-none fixed z-[70] overflow-hidden rounded-full border-2 border-teal-500 bg-white shadow-xl"
                style={{
                  width: 148,
                  height: 148,
                  left: Math.max(8, Math.min(window.innerWidth - 156, magnifierPoint.clientX + 20)),
                  top: Math.max(8, Math.min(window.innerHeight - 156, magnifierPoint.clientY + 20)),
                }}
                aria-hidden="true"
              >
                <canvas
                  ref={magnifierCanvasRef}
                  width={144}
                  height={144}
                  className="h-full w-full"
                />
              </div>
            )}
          </div>

          {/* Sidebar controls */}
          <div
            className="relative max-h-[38vh] min-h-0 w-full shrink-0 overflow-hidden border-t border-slate-200 lg:h-full lg:max-h-full lg:w-80 lg:border-l lg:border-t-0"
          >
            <div
              ref={controlsScrollRef}
              role="region"
              aria-label="Image editing controls"
              tabIndex={0}
              onScroll={(event) => {
                const scrollArea = event.currentTarget;
                const maxScrollTop = scrollArea.scrollHeight - scrollArea.clientHeight;
                setControlsScrollEdges({
                  top: scrollArea.scrollTop > 1,
                  bottom: maxScrollTop - scrollArea.scrollTop > 1,
                });
              }}
              className="max-h-[38vh] overflow-y-auto overscroll-contain scrollbar-hidden scroll-smooth focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-500 lg:h-full lg:max-h-full"
            >
              <div className="flex flex-col p-4">
              {/* Crop toggle */}
              <Section
                icon={<Crop className="h-4 w-4 text-teal-600" />}
                title="Perspective Crop"
              >
                <button
                  onClick={toggleCrop}
                  aria-pressed={cropMode}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500 ${
                    cropMode
                      ? "border-teal-300 bg-teal-50 text-teal-800"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                      cropMode ? "bg-teal-100 text-teal-700" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    <Crop className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">
                      {cropMode ? "Crop mode active" : "Enable crop"}
                    </span>
                    <span className="mt-0.5 block text-[11px] font-medium text-slate-500">
                      {cropMode ? "Drag the corners to frame your image" : "Adjust perspective and framing"}
                    </span>
                  </span>
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      cropMode ? "bg-teal-500" : "bg-slate-300"
                    }`}
                    aria-hidden="true"
                  />
                </button>
                {cropMode && (
                  <div className="mt-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-slate-700">Aspect ratio</span>
                      <span className="text-[10px] font-medium text-slate-400">Choose a preset</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: "Free", detail: "Any shape", aspect: null },
                        {
                          label: "A4",
                          detail: "Paper",
                          aspect: displayW > displayH ? 297 / 210 : 210 / 297,
                        },
                        { label: "ID card", detail: "1.59 : 1", aspect: 1.586 },
                        { label: "4:3 photo", detail: "4 : 3", aspect: 4 / 3 },
                      ].map((preset) => {
                        const selected = cropPreset === preset.label;
                        return (
                          <button
                            key={preset.label}
                            onClick={() => applyCropPreset(preset.label, preset.aspect)}
                            aria-pressed={selected}
                            className={`flex min-h-[58px] items-center justify-between gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-500 ${
                              selected
                                ? "border-teal-400 bg-teal-50 text-teal-800 shadow-sm"
                                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                            }`}
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-xs font-semibold">{preset.label}</span>
                              <span className="mt-0.5 block text-[10px] font-medium text-slate-500">
                                {preset.detail}
                              </span>
                            </span>
                            {selected ? (
                              <Check className="h-4 w-4 shrink-0 text-teal-600" aria-hidden="true" />
                            ) : (
                              <span
                                className="h-4 w-4 shrink-0 rounded border border-slate-300"
                                aria-hidden="true"
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </Section>

              <Divider />

              {/* Filters */}
              <Section
                icon={<Wand2 className="h-4 w-4 text-teal-600" />}
                title="Enhancement Filters"
              >
                <div className="grid grid-cols-1 gap-2">
                  {FILTERS.map((f) => (
                    <div
                      key={f.id}
                      className={`overflow-hidden rounded-xl border transition-all ${
                        filter === f.id
                          ? "border-teal-300 bg-white shadow-sm ring-1 ring-teal-100"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (filter !== f.id) {
                            setFilter(f.id);
                            setFineTuneOpen(f.id === "none");
                          }
                        }}
                        aria-pressed={filter === f.id}
                        className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                          filter === f.id ? "bg-teal-50/70" : "hover:bg-slate-50"
                        }`}
                      >
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                            filter === f.id
                              ? "bg-teal-500 text-white"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {f.icon}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-700">
                            {f.label}
                          </p>
                          <p className="truncate text-[10px] text-slate-400">
                            {f.desc}
                          </p>
                        </div>
                        {filter === f.id && (
                          <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-teal-700">
                            Active
                          </span>
                        )}
                      </button>
                      {filter === f.id && (
                        <div className="border-t border-slate-100 px-3 pb-1 pt-3">
                          <div className="mb-2 flex items-center justify-between">
                            {filter === "none" && (
                              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                Fine tune this filter
                              </span>
                            )}
                            {(filter === "none" || fineTuneOpen) && (
                              <button
                                type="button"
                                onClick={() => setFilterAdjustments((previous) => ({
                                  ...previous,
                                  [filter]: DEFAULT_FINE_ADJUSTMENTS,
                                }))}
                                disabled={
                                  activeAdjustments.brightness === 0 &&
                                  activeAdjustments.contrast === 0 &&
                                  activeAdjustments.saturation === 0
                                }
                                className="rounded-md px-2 py-1 text-[10px] font-semibold text-teal-700 hover:bg-teal-50 disabled:cursor-default disabled:text-slate-300 disabled:hover:bg-transparent"
                              >
                                Reset
                              </button>
                            )}
                          </div>
                          <div
                            id={`filter-adjustments-${filter}`}
                            hidden={filter !== "none" && !fineTuneOpen}
                          >
                            <AdjustSlider
                              icon={<Sun className="h-3.5 w-3.5" />}
                              label="Brightness"
                              value={activeAdjustments.brightness}
                              onChange={(value) => updateFilterAdjustment("brightness", value)}
                            />
                            <AdjustSlider
                              icon={<Contrast className="h-3.5 w-3.5" />}
                              label="Contrast"
                              value={activeAdjustments.contrast}
                              onChange={(value) => updateFilterAdjustment("contrast", value)}
                            />
                            <AdjustSlider
                              icon={<Droplets className="h-3.5 w-3.5" />}
                              label="Saturation"
                              value={activeAdjustments.saturation}
                              onChange={(value) => updateFilterAdjustment("saturation", value)}
                            />
                            {filter === "none" && (
                              <div className="mt-3 border-t border-slate-100 pt-3">
                                <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                  Saved adjustments
                                </p>
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    value={savedPresetName}
                                    onChange={(event) => setSavedPresetName(event.target.value)}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter") saveCurrentPreset();
                                    }}
                                    placeholder="Preset name"
                                    aria-label="Saved adjustment preset name"
                                    maxLength={40}
                                    className="min-w-0 flex-1 rounded-md border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-100"
                                  />
                                  <button
                                    type="button"
                                    onClick={saveCurrentPreset}
                                    disabled={!savedPresetsLoaded || !savedPresetName.trim()}
                                    className="shrink-0 rounded-md border border-teal-200 px-2.5 py-1.5 text-[11px] font-semibold text-teal-700 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    Save
                                  </button>
                                </div>
                                {savedPresets.length > 0 && (
                                  <div className="mt-2 space-y-1">
                                    {savedPresets.map((preset) => (
                                      <div
                                        key={preset.id}
                                        className="flex items-center gap-1"
                                      >
                                        <button
                                          type="button"
                                          onClick={() => setFilterAdjustments((previous) => ({
                                            ...previous,
                                            none: { ...preset.adjustments },
                                          }))}
                                          className="min-w-0 flex-1 truncate rounded px-2 py-1 text-left text-xs font-medium text-slate-600 hover:bg-teal-50 hover:text-teal-700"
                                          title={`Apply ${preset.name}`}
                                        >
                                          {preset.name}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => persistSavedPresets(
                                            savedPresets.filter((item) => item.id !== preset.id),
                                          )}
                                          aria-label={`Delete ${preset.name} preset`}
                                          title={`Delete ${preset.name}`}
                                          className="rounded px-2 py-1 text-[10px] font-medium text-slate-400 hover:bg-red-50 hover:text-red-600"
                                        >
                                          Delete
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          {(filter !== "none" || docs.length > 1) && (
                            <div
                              className={`mt-2 flex items-center ${
                                filter === "none" ? "justify-end" : "justify-between"
                              }`}
                            >
                              {filter !== "none" && (
                                <button
                                  type="button"
                                  onClick={() => setFineTuneOpen((open) => !open)}
                                  aria-label={fineTuneOpen ? "Hide fine-tuning controls" : "Fine tune this filter"}
                                  aria-expanded={fineTuneOpen}
                                  aria-controls={`filter-adjustments-${filter}`}
                                  title={fineTuneOpen ? "Hide fine-tuning controls" : "Fine tune this filter"}
                                  className={`rounded-md p-1.5 transition-colors ${
                                    fineTuneOpen
                                      ? "bg-teal-50 text-teal-700 hover:bg-teal-100"
                                      : "text-slate-500 hover:bg-slate-100 hover:text-teal-700"
                                  }`}
                                >
                                  <Sliders className="h-4 w-4" />
                                </button>
                              )}
                              {docs.length > 1 && (
                                <button
                                  type="button"
                                  onClick={handleApplyFilterToAll}
                                  disabled={saving || !hasFilterChanges}
                                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-semibold text-teal-700 transition-colors hover:bg-teal-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent"
                                >
                                  <CheckCheck className="h-4 w-4" />
                                  {applyingToAll ? "Applying…" : "Apply to all images"}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Section>

              </div>
            </div>
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute inset-x-0 top-0 z-10 h-5 bg-gradient-to-b from-white/95 to-transparent transition-opacity ${
                controlsScrollEdges.top ? "opacity-100" : "opacity-0"
              }`}
            />
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute inset-x-0 bottom-0 z-10 h-7 bg-gradient-to-t from-white/95 to-transparent transition-opacity ${
                controlsScrollEdges.bottom ? "opacity-100" : "opacity-0"
              }`}
            />
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-3">
          <p className="min-w-0 text-[11px] text-slate-400">
            {`Edits replace the current image · ${canvasRef.current?.width ?? doc.pxW} × ${canvasRef.current?.height ?? doc.pxH}px`}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              Done
            </button>
            <button
              onClick={handleSave}
              disabled={!loaded || saving || !hasEdits}
              className="flex items-center gap-2 rounded-lg bg-teal-600 px-5 py-2 text-sm font-bold text-white shadow-sm transition-all hover:bg-teal-700 hover:shadow-md disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none disabled:hover:bg-slate-300"
            >
              {saving && <RefreshCw className="h-4 w-4 animate-spin" />}
              {applyingToAll ? "Applying…" : saving ? "Saving…" : "Save image"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2.5 flex items-center gap-2">
        {icon}
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
          {title}
        </h3>
      </div>
      {children}
    </div>
  );
}

function Divider() {
  return <div className="my-4 h-px bg-slate-100" />;
}

function AdjustSlider({
  icon,
  label,
  value,
  onChange,
  min = -50,
  max = 50,
  unit = "%",
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  unit?: string;
}) {
  return (
    <div className="mb-3">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
          {icon}
          {label}
        </span>
        <span className="text-xs font-bold tabular-nums text-slate-500">
          {value > 0 && min < 0 ? "+" : ""}
          {value}{unit}
        </span>
      </div>
      <input
        type="range"
        aria-label={`${label} adjustment`}
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-teal-600"
      />
    </div>
  );
}

function CanvasToolButton({
  onClick,
  icon,
  label,
  active,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
        active
          ? "bg-teal-100 text-teal-700"
          : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      {icon}
    </button>
  );
}
