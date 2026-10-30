import { useEffect, useState } from "react";
import { FileDown, Loader2, X } from "lucide-react";
import type { LayoutSettings, UploadedDoc } from "../types";
import { generatePDF, PDF_COMPRESSION_OPTIONS, type PdfCompression } from "../lib/pdf";
import { notifyUserError } from "../lib/userErrors";

interface Props {
  docs: UploadedDoc[];
  settings: LayoutSettings;
  blankPageCount: number;
  onExport: (pdf: Blob) => void;
  onCancel: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function SizeEstimate({
  sourceSize,
  estimatedPdf,
  estimating,
}: {
  sourceSize: number;
  estimatedPdf: Blob | null;
  estimating: boolean;
}) {
  return (
    <span className="mt-3 grid grid-cols-2 gap-2">
      <span className="min-w-0 rounded-lg border border-slate-200 bg-white/80 px-2.5 py-2">
        <span className="block text-[10px] font-medium uppercase tracking-wide text-slate-500">
          Actual Size
        </span>
        <strong className="mt-0.5 block text-xs font-semibold text-slate-700">
          {formatBytes(sourceSize)}
        </strong>
      </span>
      <span className="min-w-0 rounded-lg border border-teal-200 bg-teal-50/70 px-2.5 py-2">
        <span className="block text-[10px] font-medium uppercase tracking-wide text-teal-700">
          Estimated Size
        </span>
        <span className="mt-0.5 block text-xs font-semibold text-teal-800">
          {estimating
            ? <strong className="block">Calculating...</strong>
            : estimatedPdf
              ? <strong className="block">{formatBytes(estimatedPdf.size)}</strong>
              : <strong className="block">Unavailable</strong>}
        </span>
      </span>
    </span>
  );
}

export default function PdfExportDialog({
  docs,
  settings,
  blankPageCount,
  onExport,
  onCancel,
}: Props) {
  const [compression, setCompression] = useState<PdfCompression>("balanced");
  const [targetSize, setTargetSize] = useState("");
  const [targetUnit, setTargetUnit] = useState<"KB" | "MB">("KB");
  const [estimatedPdf, setEstimatedPdf] = useState<Blob | null>(null);
  const [estimating, setEstimating] = useState(true);
  const [exporting, setExporting] = useState(false);
  const sourceSize = docs.reduce((total, doc) => total + doc.file.size, 0);
  const targetBytes =
    Number(targetSize) * (targetUnit === "MB" ? 1024 * 1024 : 1024);
  const validTarget =
    compression !== "custom" ||
    (targetSize.trim() !== "" && Number.isFinite(targetBytes) && targetBytes > 0);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  useEffect(() => {
    let active = true;
    setEstimatedPdf(null);
    if (compression === "uncompressed" || !validTarget) {
      setEstimating(false);
      return () => {
        active = false;
      };
    }

    setEstimating(true);
    const timeout = window.setTimeout(() => {
      void generatePDF(
        docs,
        settings,
        compression,
        compression === "custom" ? targetBytes : undefined,
        blankPageCount,
      )
        .then((pdf) => {
          if (active) setEstimatedPdf(pdf);
        })
        .catch((error: unknown) => {
          console.error("Could not estimate PDF size", error);
          if (active) {
            notifyUserError(
              "Couldn't prepare the PDF estimate. Check the images and try again.",
            );
          }
        })
        .finally(() => {
          if (active) setEstimating(false);
        });
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [blankPageCount, compression, docs, settings, targetBytes, validTarget]);

  const selectCompression = (value: PdfCompression) => {
    setEstimatedPdf(null);
    setCompression(value);
  };

  const exportSelectedPdf = async () => {
    if (compression !== "uncompressed") {
      if (estimatedPdf) onExport(estimatedPdf);
      return;
    }

    setExporting(true);
    try {
      const pdf = await generatePDF(
        docs,
        settings,
        compression,
        undefined,
        blankPageCount,
      );
      onExport(pdf);
    } catch (error: unknown) {
      console.error("Could not generate PDF", error);
      notifyUserError("Couldn't create the PDF. Check the images and try again.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="pdf-export-title"
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              <FileDown className="h-5 w-5" />
            </span>
            <div>
              <h2 id="pdf-export-title" className="text-base font-bold text-slate-800">
                Export PDF
              </h2>
              <p className="text-xs text-slate-500">
                Choose the image quality and file size.
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close PDF options"
            onClick={onCancel}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <fieldset className="space-y-2">
          <legend className="sr-only">PDF compression level</legend>
          {PDF_COMPRESSION_OPTIONS.map((option) => (
            <label
              key={option.id}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                compression === option.id
                  ? "border-teal-400 bg-teal-50/70"
                  : "border-slate-200 hover:bg-slate-50"
              }`}
            >
              <input
                type="radio"
                name="pdf-compression"
                value={option.id}
                checked={compression === option.id}
                onChange={() => selectCompression(option.id)}
                className="mt-0.5 accent-teal-600"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  {option.label}
                  {option.id === "balanced" && (
                    <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-700">
                      Recommended
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                  {option.description}
                </span>
                {compression === option.id && option.id !== "uncompressed" && (
                  <SizeEstimate
                    sourceSize={sourceSize}
                    estimatedPdf={estimatedPdf}
                    estimating={estimating}
                  />
                )}
              </span>
            </label>
          ))}
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
              compression === "custom"
                ? "border-teal-400 bg-teal-50/70"
                : "border-slate-200 hover:bg-slate-50"
            }`}
          >
            <input
              type="radio"
              name="pdf-compression"
              value="custom"
              checked={compression === "custom"}
              onChange={() => selectCompression("custom")}
              className="mt-0.5 accent-teal-600"
            />
            <span className="min-w-0 flex-1">
              <span className="text-sm font-semibold text-slate-800">Custom target size</span>
              <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                Compress the PDF to fit your preferred size.
              </span>
              {compression === "custom" && (
                <SizeEstimate
                  sourceSize={sourceSize}
                  estimatedPdf={estimatedPdf}
                  estimating={estimating}
                />
              )}
              {compression === "custom" && (
                <span className="mt-3 block max-w-xs">
                  <span className="mb-1.5 block text-[11px] font-semibold text-slate-600">
                    Maximum file size
                  </span>
                  <span className="flex items-center overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition focus-within:border-teal-500 focus-within:ring-4 focus-within:ring-teal-500/10">
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    value={targetSize}
                    onChange={(event) => {
                      setEstimatedPdf(null);
                      setTargetSize(event.target.value);
                    }}
                    aria-label="Target PDF size"
                    className="w-full min-w-0 border-0 bg-transparent px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:ring-0"
                  />
                  <select
                    value={targetUnit}
                    onChange={(event) => {
                      setEstimatedPdf(null);
                      setTargetUnit(event.target.value === "KB" ? "KB" : "MB");
                    }}
                    aria-label="Target size unit"
                    className="h-full cursor-pointer border-0 border-l border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none focus:ring-0"
                  >
                    <option value="KB">KB</option>
                    <option value="MB">MB</option>
                  </select>
                  </span>
                </span>
              )}
            </span>
          </label>
        </fieldset>

        {compression === "custom" &&
        validTarget &&
        estimatedPdf &&
        estimatedPdf.size > targetBytes ? (
          <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs">
            <p className="text-amber-700" role="status">
              This target is too small to reach with the available compression. The estimate is above your target.
            </p>
          </div>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void exportSelectedPdf()}
            disabled={
              exporting ||
              (compression === "uncompressed"
                ? false
                : !estimatedPdf || estimating || !validTarget)
            }
            className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileDown className="h-4 w-4" />
            )}
            {exporting ? "Preparing PDF..." : "Export PDF"}
          </button>
        </div>
      </section>
    </div>
  );
}
