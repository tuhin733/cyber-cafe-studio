import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Crop,
  Download,
  ImagePlus,
  LockKeyhole,
  LockKeyholeOpen,
  RefreshCw,
  Scaling,
  Shrink,
  WandSparkles,
} from "lucide-react";
import {
  getAspectDimension,
  getCropBounds,
  MAX_IMAGE_PIXELS,
  validateOutputDimensions,
  type CropSelection,
} from "../lib/imageTools";

type ToolMode = "resize" | "compress" | "crop" | "convert";
type OutputFormat = "image/jpeg" | "image/png" | "image/webp";
type ImageSource = {
  file: File;
  url: string;
  image: HTMLImageElement;
};

const OUTPUT_FORMATS: Array<{ value: OutputFormat; label: string; extension: string }> = [
  { value: "image/jpeg", label: "JPG", extension: "jpg" },
  { value: "image/png", label: "PNG", extension: "png" },
  { value: "image/webp", label: "WebP", extension: "webp" },
];

const TOOLS: Array<{ id: ToolMode; label: string; icon: typeof Scaling }> = [
  { id: "resize", label: "Resize", icon: Scaling },
  { id: "compress", label: "Compress", icon: Shrink },
  { id: "crop", label: "Crop", icon: Crop },
  { id: "convert", label: "Convert", icon: WandSparkles },
];

const FULL_CROP: CropSelection = { x: 0, y: 0, width: 1, height: 1 };

function getFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getFormat(mimeType: string): OutputFormat {
  if (mimeType === "image/png" || mimeType === "image/webp") return mimeType;
  return "image/jpeg";
}

function getBaseName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "") || "image";
}

function getSelectionFromPointer(
  bounds: DOMRect,
  start: { x: number; y: number },
  clientX: number,
  clientY: number,
): CropSelection {
  const currentX = Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width));
  const currentY = Math.max(0, Math.min(1, (clientY - bounds.top) / bounds.height));
  const left = Math.min(start.x, currentX);
  const top = Math.min(start.y, currentY);
  return {
    x: left,
    y: top,
    width: Math.abs(currentX - start.x),
    height: Math.abs(currentY - start.y),
  };
}

function buttonClass(active: boolean) {
  return `flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
    active
      ? "bg-teal-600 text-white shadow-sm"
      : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
  }`;
}

function inputClass() {
  return "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100";
}

interface Props {
  onClose: () => void;
}

export default function ImageTools({ onClose }: Props) {
  const [source, setSource] = useState<ImageSource | null>(null);
  const [mode, setMode] = useState<ToolMode>("resize");
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("image/jpeg");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [keepAspectRatio, setKeepAspectRatio] = useState(true);
  const [quality, setQuality] = useState(80);
  const [crop, setCrop] = useState<CropSelection>(FULL_CROP);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const cropStartRef = useRef<{ x: number; y: number } | null>(null);
  const loadRequestRef = useRef(0);

  useEffect(() => {
    return () => {
      if (source) URL.revokeObjectURL(source.url);
      loadRequestRef.current += 1;
    };
  }, [source]);

  const loadFile = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file to continue.");
      return;
    }

    const requestId = ++loadRequestRef.current;
    const url = URL.createObjectURL(file);
    const image = new Image();
    setIsLoading(true);
    setError("");
    setSuccess("");
    image.onload = () => {
      if (requestId !== loadRequestRef.current) {
        URL.revokeObjectURL(url);
        return;
      }
      if (
        image.naturalWidth < 1 ||
        image.naturalHeight < 1 ||
        image.naturalWidth * image.naturalHeight > MAX_IMAGE_PIXELS
      ) {
        URL.revokeObjectURL(url);
        setError(
          `This image is too large to process. Choose an image under ${MAX_IMAGE_PIXELS.toLocaleString()} pixels.`,
        );
        setIsLoading(false);
        return;
      }
      setSource({ file, url, image });
      setWidth(String(image.naturalWidth));
      setHeight(String(image.naturalHeight));
      setOutputFormat(getFormat(file.type));
      setCrop(FULL_CROP);
      setIsLoading(false);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      if (requestId !== loadRequestRef.current) return;
      setIsLoading(false);
      setError("This image could not be opened. Try another image file.");
    };
    image.src = url;
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    loadFile(event.dataTransfer.files[0]);
  };

  const updateDimension = (dimension: "width" | "height", value: string) => {
    if (dimension === "width") setWidth(value);
    else setHeight(value);
    setError("");
    setSuccess("");
    if (!keepAspectRatio || !source || !/^\d+$/.test(value)) return;

    const parsedValue = Number(value);
    if (parsedValue < 1) return;
    try {
      const pairedDimension = getAspectDimension(
        source.image.naturalWidth,
        source.image.naturalHeight,
        dimension,
        parsedValue,
      );
      if (dimension === "width") setHeight(String(pairedDimension));
      else setWidth(String(pairedDimension));
    } catch (dimensionError) {
      setError(
        dimensionError instanceof Error
          ? dimensionError.message
          : "The image dimensions are invalid.",
      );
    }
  };

  const updateCrop = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!cropStartRef.current || !previewRef.current) return;
    setCrop(
      getSelectionFromPointer(
        previewRef.current.getBoundingClientRect(),
        cropStartRef.current,
        event.clientX,
        event.clientY,
      ),
    );
  };

  const handleProcess = async () => {
    if (!source) return;
    setIsProcessing(true);
    setError("");
    setSuccess("");

    try {
      let cropBounds = {
        x: 0,
        y: 0,
        width: source.image.naturalWidth,
        height: source.image.naturalHeight,
      };
      if (mode === "crop") {
        cropBounds = getCropBounds(
          crop,
          source.image.naturalWidth,
          source.image.naturalHeight,
        );
      }

      const dimensions =
        mode === "resize"
          ? validateOutputDimensions(Number(width), Number(height))
          : validateOutputDimensions(cropBounds.width, cropBounds.height);
      const canvas = document.createElement("canvas");
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Image processing is unavailable.");
      if (outputFormat === "image/jpeg") {
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      context.drawImage(
        source.image,
        cropBounds.x,
        cropBounds.y,
        cropBounds.width,
        cropBounds.height,
        0,
        0,
        dimensions.width,
        dimensions.height,
      );

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (result) => {
            if (result) resolve(result);
            else reject(new Error("The image could not be exported in this format."));
          },
          outputFormat,
          outputFormat === "image/png" ? undefined : quality / 100,
        );
      });
      if (blob.type !== outputFormat) {
        throw new Error(
          `This browser cannot export ${outputFormat.split("/")[1].toUpperCase()} images.`,
        );
      }
      const selectedFormat = OUTPUT_FORMATS.find(
        (format) => format.value === outputFormat,
      );
      if (!selectedFormat) throw new Error("Choose a supported image format.");
      const suffix = {
        resize: "resized",
        compress: "compressed",
        crop: "cropped",
        convert: "converted",
      }[mode];
      const fileName = `${getBaseName(source.file.name)}-${suffix}.${selectedFormat.extension}`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setSuccess(
        `Downloaded ${fileName} • ${dimensions.width.toLocaleString()} × ${dimensions.height.toLocaleString()} px • ${getFileSize(blob.size)}`,
      );
    } catch (processingError) {
      console.error("Unable to process image", processingError);
      setError(
        processingError instanceof Error
          ? processingError.message
          : "The image could not be processed. Try another image or smaller dimensions.",
      );
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <main className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col px-4 py-5 sm:px-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              aria-label="Back to document workspace"
              title="Back"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-slate-800">
                Image Tools
              </h2>
              <p className="text-xs text-slate-500">
                Resize, compress, crop, and convert images on your device.
              </p>
            </div>
          </div>
          <span className="hidden rounded-full bg-teal-50 px-3 py-1 text-[11px] font-semibold text-teal-700 sm:inline">
            Private · processed locally
          </span>
        </div>

        <div className="grid flex-1 gap-4 min-[850px]:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
          <section
            className={`flex min-h-[22rem] flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition-colors ${
              isDragging ? "border-teal-500 ring-2 ring-teal-100" : "border-slate-200"
            }`}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setIsDragging(false);
              }
            }}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                loadFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <h3 className="text-sm font-bold text-slate-700">Preview</h3>
                {source && (
                  <p className="mt-0.5 max-w-[50vw] truncate text-[11px] text-slate-400">
                    {source.file.name} · {source.image.naturalWidth.toLocaleString()} ×{" "}
                    {source.image.naturalHeight.toLocaleString()} px ·{" "}
                    {getFileSize(source.file.size)}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              >
                {source ? (
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {source ? "Change image" : "Choose image"}
              </button>
            </div>

            <div className="relative flex min-h-[18rem] flex-1 items-center justify-center overflow-hidden bg-slate-50 p-4 sm:min-h-[25rem]">
              {source ? (
                <div
                  ref={previewRef}
                  className={`relative inline-block max-h-full max-w-full select-none ${
                    mode === "crop" ? "cursor-crosshair touch-none" : ""
                  }`}
                  onPointerDown={(event) => {
                    if (mode !== "crop" || !previewRef.current) return;
                    const bounds = previewRef.current.getBoundingClientRect();
                    const point = {
                      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
                      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
                    };
                    cropStartRef.current = point;
                    setCrop({ ...point, width: 0, height: 0 });
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }}
                  onPointerMove={updateCrop}
                  onPointerUp={(event) => {
                    updateCrop(event);
                    cropStartRef.current = null;
                    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                      event.currentTarget.releasePointerCapture(event.pointerId);
                    }
                  }}
                  onPointerCancel={() => {
                    cropStartRef.current = null;
                  }}
                >
                  <img
                    src={source.url}
                    alt={`Preview of ${source.file.name}`}
                    draggable={false}
                    className="block max-h-[58vh] max-w-full rounded-lg object-contain shadow-sm"
                  />
                  {mode === "crop" && (
                    <svg
                      className="pointer-events-none absolute inset-0 h-full w-full"
                      viewBox="0 0 1000 1000"
                      preserveAspectRatio="none"
                      aria-hidden="true"
                    >
                      <path
                        d={`M0 0H1000V1000H0Z M${crop.x * 1000} ${crop.y * 1000}h${crop.width * 1000}v${crop.height * 1000}H${crop.x * 1000}Z`}
                        fill="rgba(15, 23, 42, 0.48)"
                        fillRule="evenodd"
                      />
                      <rect
                        x={crop.x * 1000}
                        y={crop.y * 1000}
                        width={crop.width * 1000}
                        height={crop.height * 1000}
                        fill="none"
                        stroke="white"
                        strokeWidth="5"
                      />
                    </svg>
                  )}
                  {mode === "crop" && (
                    <span className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-slate-900/75 px-3 py-1 text-[11px] font-medium text-white">
                      Drag on the image to select a crop area
                    </span>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full max-w-sm flex-col items-center rounded-2xl border-2 border-dashed border-slate-300 bg-white/70 px-6 py-10 text-center transition-colors hover:border-teal-400 hover:bg-teal-50/50"
                >
                  <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-600">
                    <ImagePlus className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <span className="text-sm font-bold text-slate-700">
                    {isLoading ? "Opening image…" : "Choose an image to get started"}
                  </span>
                  <span className="mt-1 text-xs text-slate-400">
                    Or drag and drop an image here
                  </span>
                  <span className="mt-4 rounded-full bg-slate-100 px-3 py-1 text-[10px] font-medium text-slate-500">
                    JPG · PNG · WebP · GIF and more
                  </span>
                </button>
              )}
            </div>
          </section>

          <section className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <h3 className="text-sm font-bold text-slate-800">Choose a tool</h3>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {TOOLS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={mode === id}
                  onClick={() => {
                    setMode(id);
                    setError("");
                    setSuccess("");
                  }}
                  className={buttonClass(mode === id)}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-5 min-h-36 border-t border-slate-100 pt-4">
              {mode === "resize" && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-700">New dimensions</h4>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    Set the output size in pixels. Keep the proportions linked to avoid stretching.
                  </p>
                  <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                    <label className="text-xs font-medium text-slate-600">
                      Width
                      <input
                        type="number"
                        min="1"
                        max="20000"
                        step="1"
                        value={width}
                        onChange={(event) => updateDimension("width", event.target.value)}
                        className={`${inputClass()} mt-1`}
                      />
                    </label>
                    <button
                      type="button"
                      aria-label={keepAspectRatio ? "Unlock aspect ratio" : "Lock aspect ratio"}
                      aria-pressed={keepAspectRatio}
                      title={keepAspectRatio ? "Aspect ratio locked" : "Aspect ratio unlocked"}
                      onClick={() => setKeepAspectRatio((current) => !current)}
                      className="mb-0.5 flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
                    >
                      {keepAspectRatio ? (
                        <LockKeyhole className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <LockKeyholeOpen className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                    <label className="text-xs font-medium text-slate-600">
                      Height
                      <input
                        type="number"
                        min="1"
                        max="20000"
                        step="1"
                        value={height}
                        onChange={(event) => updateDimension("height", event.target.value)}
                        className={`${inputClass()} mt-1`}
                      />
                    </label>
                  </div>
                </div>
              )}
              {mode === "compress" && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-700">Compression quality</h4>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    Lower quality usually means a smaller file. PNG is lossless and ignores this setting.
                  </p>
                  <label className="mt-4 block text-xs font-medium text-slate-600">
                    Quality <span className="float-right text-slate-500">{quality}%</span>
                    <input
                      type="range"
                      min="10"
                      max="100"
                      value={quality}
                      onChange={(event) => setQuality(Number(event.target.value))}
                      className="mt-3 w-full accent-teal-600"
                    />
                  </label>
                </div>
              )}
              {mode === "crop" && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-700">Select crop area</h4>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    Drag across the image to choose the part to keep. The crop can be adjusted as often as you like.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setCrop(FULL_CROP);
                      setSuccess("");
                    }}
                    className="mt-3 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-teal-700 transition-colors hover:bg-teal-50"
                  >
                    Reset crop selection
                  </button>
                </div>
              )}
              {mode === "convert" && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-700">Convert image format</h4>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    Convert your image to JPG, PNG, or WebP. Transparent areas become white in JPG.
                  </p>
                </div>
              )}

              <label className="mt-4 block text-xs font-medium text-slate-600">
                Output format
                <select
                  value={outputFormat}
                  onChange={(event) => setOutputFormat(event.target.value as OutputFormat)}
                  className={`${inputClass()} mt-1`}
                >
                  {OUTPUT_FORMATS.map((format) => (
                    <option key={format.value} value={format.value}>
                      {format.label}
                    </option>
                  ))}
                </select>
              </label>
              {outputFormat !== "image/png" && mode !== "compress" && (
                <label className="mt-3 block text-xs font-medium text-slate-600">
                  Output quality <span className="float-right text-slate-500">{quality}%</span>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={quality}
                    onChange={(event) => setQuality(Number(event.target.value))}
                    className="mt-2 w-full accent-teal-600"
                  />
                </label>
              )}
            </div>

            {error && (
              <p
                role="alert"
                className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-relaxed text-rose-700"
              >
                {error}
              </p>
            )}
            {success && (
              <p
                role="status"
                className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-relaxed text-emerald-700"
              >
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{success}</span>
              </p>
            )}

            <button
              type="button"
              disabled={!source || isLoading || isProcessing}
              onClick={() => void handleProcess()}
              className="mt-auto flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              {isProcessing
                ? "Processing image…"
                : mode === "resize"
                  ? "Resize & download"
                  : mode === "compress"
                    ? "Compress & download"
                    : mode === "crop"
                      ? "Crop & download"
                      : "Convert & download"}
            </button>
            <p className="mt-2 text-center text-[10px] text-slate-400">
              Your image is processed locally and never uploaded.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
