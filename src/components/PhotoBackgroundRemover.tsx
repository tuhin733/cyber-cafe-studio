import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Download,
  ImagePlus,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import type { ProgressInfo } from "@huggingface/transformers";
import { MAX_IMAGE_PIXELS } from "../lib/imageTools";

type BackgroundOption = "transparent" | "white" | "light" | "blue" | "custom";
type LoadedImage = { file: File; url: string; image: HTMLImageElement };

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const BACKGROUND_COLORS: Record<Exclude<BackgroundOption, "transparent" | "custom">, string> = {
  white: "#ffffff",
  light: "#e2e8f0",
  blue: "#bfdbfe",
};

function getBackgroundColor(option: BackgroundOption, customColor: string) {
  if (option === "custom") return customColor;
  if (option === "transparent") return null;
  return BACKGROUND_COLORS[option];
}

function getBaseName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "") || "photo";
}

function buttonClass(active: boolean) {
  return `rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
    active
      ? "border-teal-600 bg-teal-50 text-teal-700 ring-1 ring-teal-600"
      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
  }`;
}

interface Props {
  onClose: () => void;
}

export default function PhotoBackgroundRemover({ onClose }: Props) {
  const [source, setSource] = useState<LoadedImage | null>(null);
  const [result, setResult] = useState<LoadedImage | null>(null);
  const [background, setBackground] = useState<BackgroundOption>("transparent");
  const [customColor, setCustomColor] = useState("#ffffff");
  const [isRemovingBackground, setIsRemovingBackground] = useState(false);
  const [isSavingImage, setIsSavingImage] = useState(false);
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  const [modelProgress, setModelProgress] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef(0);
  const processIdRef = useRef(0);

  useEffect(() => {
    if (!source) return;
    return () => URL.revokeObjectURL(source.url);
  }, [source]);

  useEffect(() => {
    if (!result) return;
    return () => URL.revokeObjectURL(result.url);
  }, [result]);

  useEffect(() => () => {
    requestIdRef.current += 1;
    processIdRef.current += 1;
  }, []);

  const loadFile = (file?: File) => {
    if (!file) return;
    const requestId = ++requestIdRef.current;
    setIsLoadingImage(false);
    setError("");
    setMessage("");
    setResult(null);

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Choose a JPG, PNG, or WebP photo.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError("Choose an image smaller than 20 MB.");
      return;
    }

    setSource(null);
    setIsLoadingImage(true);
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      if (requestId !== requestIdRef.current) {
        URL.revokeObjectURL(url);
        return;
      }
      setIsLoadingImage(false);
      if (
        image.naturalWidth < 1 ||
        image.naturalHeight < 1 ||
        image.naturalWidth * image.naturalHeight > MAX_IMAGE_PIXELS
      ) {
        URL.revokeObjectURL(url);
        setError(
          `Choose an image under ${MAX_IMAGE_PIXELS.toLocaleString()} pixels.`,
        );
        return;
      }
      setSource({ file, url, image });
      setBackground("transparent");
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      if (requestId === requestIdRef.current) {
        setIsLoadingImage(false);
        setError("This image could not be opened. Try another photo.");
      }
    };
    image.src = url;
  };

  const removeBackground = async () => {
    if (!source) return;
    const processId = ++processIdRef.current;
    setIsRemovingBackground(true);
    setModelProgress(null);
    setError("");
    setMessage("");

    try {
      const { removePortraitBackground } = await import(
        "../lib/localBackgroundRemover"
      );
      const { blob } = await removePortraitBackground(
        source.image,
        (progress: ProgressInfo) => {
          if (progress.status === "progress_total") {
            setModelProgress(Math.max(0, Math.min(100, Math.round(progress.progress))));
          }
        },
      );
      if (processId !== processIdRef.current) return;
      const url = URL.createObjectURL(blob);
      const image = new Image();
      try {
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error("The portrait cutout could not be previewed."));
          image.src = url;
        });
        if (
          image.naturalWidth < 1 ||
          image.naturalHeight < 1 ||
          image.naturalWidth * image.naturalHeight > MAX_IMAGE_PIXELS
        ) {
          throw new Error("The portrait cutout exceeds the supported pixel limit.");
        }
      } catch (previewError) {
        URL.revokeObjectURL(url);
        throw previewError;
      }
      if (processId !== processIdRef.current) {
        URL.revokeObjectURL(url);
        return;
      }
      setResult({
        file: new File(
          [blob],
          `${getBaseName(source.file.name)}-no-background.png`,
          { type: "image/png" },
        ),
        url,
        image,
      });
      setMessage("Background removed locally. Choose a background and download your PNG.");
    } catch (processingError) {
      if (processId !== processIdRef.current) return;
      console.error("Unable to remove portrait background locally", processingError);
      setError(
        processingError instanceof Error
          ? processingError.message
          : "The background could not be removed. Check your internet connection and try again.",
      );
    } finally {
      if (processId === processIdRef.current) {
        setIsRemovingBackground(false);
        setModelProgress(null);
      }
    }
  };

  const downloadResult = async () => {
    if (!result) return;
    setIsSavingImage(true);
    setError("");
    try {
      const canvas = document.createElement("canvas");
      canvas.width = result.image.naturalWidth;
      canvas.height = result.image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Image export is unavailable.");
      const backgroundColor = getBackgroundColor(background, customColor);
      if (backgroundColor) {
        context.fillStyle = backgroundColor;
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      context.drawImage(result.image, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (output) => {
            if (output) resolve(output);
            else reject(new Error("The portrait cutout could not be exported."));
          },
          "image/png",
        );
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${getBaseName(source?.file.name ?? "photo")}-no-background.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("PNG downloaded.");
    } catch (downloadError) {
      console.error("Unable to export portrait cutout", downloadError);
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "The result could not be downloaded.",
      );
    } finally {
      setIsSavingImage(false);
    }
  };

  const previewImage = result ?? source;
  const previewBackground = getBackgroundColor(background, customColor);

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
                Photo Background Remover
              </h2>
              <p className="text-xs text-slate-500">
                Remove portrait backgrounds with local AI.
              </p>
            </div>
          </div>
          <span className="hidden rounded-full bg-teal-50 px-3 py-1 text-[11px] font-semibold text-teal-700 sm:inline">
            Private · processed locally
          </span>
        </div>

        <div className="grid flex-1 gap-4 min-[850px]:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
          <section className="flex min-h-[22rem] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={isRemovingBackground || isLoadingImage}
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
                    {source.image.naturalHeight.toLocaleString()} px
                  </p>
                )}
              </div>
              <button
                type="button"
                disabled={isRemovingBackground || isLoadingImage}
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                {source ? (
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {source ? "Change photo" : "Choose photo"}
              </button>
            </div>
            <div
              className={`relative flex min-h-[18rem] flex-1 items-center justify-center overflow-hidden p-4 sm:min-h-[25rem] ${
                isDragging ? "bg-teal-50" : "bg-slate-50"
              }`}
              onDragOver={(event) => {
                event.preventDefault();
                if (!isRemovingBackground) setIsDragging(true);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setIsDragging(false);
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragging(false);
                if (!isRemovingBackground) loadFile(event.dataTransfer.files[0]);
              }}
            >
              {isLoadingImage ? (
                <p className="text-sm font-medium text-slate-500">Opening photo…</p>
              ) : previewImage ? (
                <div
                  className="inline-flex max-h-full max-w-full items-center justify-center overflow-hidden rounded-lg shadow-sm"
                  style={{
                    backgroundColor: previewBackground ?? undefined,
                    backgroundImage: previewBackground
                      ? undefined
                      : "conic-gradient(#e2e8f0 25%, #f8fafc 0 50%, #e2e8f0 0 75%, #f8fafc 0)",
                    backgroundSize: previewBackground ? undefined : "20px 20px",
                  }}
                >
                  <img
                    src={previewImage.url}
                    alt={result ? "Portrait with background removed" : "Original portrait"}
                    draggable={false}
                    className="block max-h-[58vh] max-w-full object-contain"
                  />
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
                    Choose a portrait to get started
                  </span>
                  <span className="mt-1 text-xs text-slate-400">
                    Or drag and drop it here
                  </span>
                  <span className="mt-4 rounded-full bg-slate-100 px-3 py-1 text-[10px] font-medium text-slate-500">
                    JPG · PNG · WebP · Max 20 MB
                  </span>
                </button>
              )}
            </div>
          </section>

          <section className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <button
              type="button"
              disabled={!source || isRemovingBackground || isLoadingImage}
              onClick={() => void removeBackground()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isRemovingBackground ? (
                <>
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                  {modelProgress === null
                    ? "Loading local AI model…"
                    : `Downloading model · ${modelProgress}%`}
                </>
              ) : result ? (
                "Remove background again"
              ) : (
                "Remove background"
              )}
            </button>
            {isRemovingBackground && (
              <p role="status" className="mt-2 text-center text-[11px] text-slate-500">
                {modelProgress === null
                  ? "First run downloads the model; your photo is never uploaded."
                  : "Downloading model from Hugging Face. This happens once."}
              </p>
            )}

            {result && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <h4 className="text-xs font-semibold text-slate-700">Background preview</h4>
                <div className="mt-2 flex flex-wrap gap-2">
                  {([
                    ["transparent", "Transparent"],
                    ["white", "White"],
                    ["light", "Light gray"],
                    ["blue", "Blue"],
                    ["custom", "Custom"],
                  ] as const).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={background === id}
                      onClick={() => setBackground(id)}
                      className={buttonClass(background === id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {background === "custom" && (
                  <label className="mt-3 flex items-center justify-between text-xs font-medium text-slate-600">
                    Custom background color
                    <input
                      type="color"
                      value={customColor}
                      onChange={(event) => setCustomColor(event.target.value)}
                      className="h-9 w-14 cursor-pointer rounded-lg border border-slate-200 bg-white p-1"
                    />
                  </label>
                )}
                <button
                  type="button"
                  disabled={isSavingImage}
                  onClick={() => void downloadResult()}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 py-2.5 text-sm font-bold text-teal-700 transition-colors hover:bg-teal-100 disabled:opacity-50"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  {isSavingImage ? "Preparing PNG…" : "Download PNG"}
                </button>
              </div>
            )}

            {message && (
              <p role="status" className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs leading-relaxed text-emerald-700">
                {message}
              </p>
            )}
            {error && (
              <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-relaxed text-rose-700">
                {error}
              </p>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
