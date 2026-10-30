import { useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  FilePlus2,
  Files,
  LoaderCircle,
  Minimize2,
  Trash2,
} from "lucide-react";
import {
  compressPdfFile,
  mergePdfFiles,
  savePdfToolResult,
  type PdfCompressionPreset,
  type PdfProgress,
} from "../lib/pdfTools";

type PdfFile = {
  id: string;
  file: File;
};

type ToolMode = "merge" | "compress";

const MAX_FILE_SIZE = 100 * 1024 * 1024;
const MAX_FILE_COUNT = 20;

const COMPRESSION_OPTIONS: Array<{
  id: PdfCompressionPreset;
  label: string;
  description: string;
}> = [
  {
    id: "balanced",
    label: "Balanced",
    description: "Good readability with moderate size reduction",
  },
  {
    id: "small",
    label: "Smaller file",
    description: "Lower resolution for easier sharing",
  },
  {
    id: "smallest",
    label: "Smallest file",
    description: "Lowest resolution; fine print may be harder to read",
  },
];

interface Props {
  onClose: () => void;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function makePdfFileName(value: string) {
  return value.trim().replace(/[<>:"/\\|?*]/g, "").replace(/\s+/g, "-").slice(0, 80)
    || "document";
}

export default function PdfTools({ onClose }: Props) {
  const [mode, setMode] = useState<ToolMode>("merge");
  const [files, setFiles] = useState<PdfFile[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [preset, setPreset] = useState<PdfCompressionPreset>("balanced");
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<PdfProgress | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalSize = files.reduce((total, item) => total + item.file.size, 0);
  const selectedFile = files.find((item) => item.id === selectedId) ?? files[0];

  const addFiles = (selectedFiles: FileList | File[]) => {
    if (isProcessing) return;
    setError("");
    setMessage("");
    const additions: PdfFile[] = [];
    for (const file of Array.from(selectedFiles)) {
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        setError(`${file.name}: choose a PDF file.`);
        continue;
      }
      if (file.size === 0 || file.size > MAX_FILE_SIZE) {
        setError(`${file.name}: choose a PDF smaller than 100 MB.`);
        continue;
      }
      if (files.length + additions.length >= MAX_FILE_COUNT) {
        setError(`You can add up to ${MAX_FILE_COUNT} PDF files.`);
        break;
      }
      additions.push({ id: `${Date.now()}-${Math.random()}`, file });
    }

    if (additions.length) {
      setFiles((current) => [...current, ...additions]);
      setSelectedId((current) => current || additions[0].id);
    }
  };

  const removeFile = (id: string) => {
    const next = files.filter((item) => item.id !== id);
    setFiles(next);
    setSelectedId((selected) => selected === id ? next[0]?.id ?? "" : selected);
    setError("");
    setMessage("");
  };

  const moveFile = (index: number, offset: -1 | 1) => {
    setFiles((current) => {
      const destination = index + offset;
      if (destination < 0 || destination >= current.length) return current;
      const reordered = [...current];
      [reordered[index], reordered[destination]] = [reordered[destination], reordered[index]];
      return reordered;
    });
    setMessage("");
  };

  const handleProcess = async () => {
    if (mode === "merge" && files.length < 2) {
      setError("Choose at least two PDF files to merge.");
      return;
    }
    if (mode === "compress" && !selectedFile) {
      setError("Choose a PDF file to compress.");
      return;
    }

    setIsProcessing(true);
    setProgress(null);
    setError("");
    setMessage("");
    try {
      const result = mode === "merge"
        ? await mergePdfFiles(files.map((item) => item.file))
        : await compressPdfFile(selectedFile.file, preset, setProgress);
      const outputName = mode === "merge"
        ? "merged-document.pdf"
        : `${makePdfFileName(selectedFile.file.name.replace(/\.pdf$/i, ""))}-compressed.pdf`;
      const saved = await savePdfToolResult(result, outputName);
      if (saved) {
        if (mode === "compress") {
          const difference = selectedFile.file.size - result.size;
          const change = difference >= 0
            ? `reduced by ${formatBytes(difference)}`
            : `increased by ${formatBytes(Math.abs(difference))}`;
          setMessage(`Compressed PDF saved · ${formatBytes(selectedFile.file.size)} → ${formatBytes(result.size)} (${change}).`);
        } else {
          setMessage(`Merged ${files.length} PDFs into ${formatBytes(result.size)}.`);
        }
      }
    } catch (processingError) {
      console.error("Unable to process PDF files", processingError);
      const details = processingError instanceof Error ? processingError.message : "";
      setError(details || "Couldn't process the PDF. Check that the file is valid and try again.");
    } finally {
      setIsProcessing(false);
      setProgress(null);
    }
  };

  const isMerging = mode === "merge";
  const canProcess = isMerging ? files.length >= 2 : Boolean(selectedFile);

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
              <h2 className="text-lg font-bold text-slate-800">PDF Tools</h2>
              <p className="text-xs text-slate-500">Merge PDFs or reduce a PDF’s file size on your device.</p>
            </div>
          </div>
          <span className="hidden rounded-full bg-teal-50 px-3 py-1 text-[11px] font-semibold text-teal-700 sm:inline">
            Private · processed locally
          </span>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            aria-pressed={isMerging}
            onClick={() => {
              setMode("merge");
              setError("");
              setMessage("");
            }}
            className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${isMerging ? "bg-white text-teal-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
          >
            <Files className="h-4 w-4" aria-hidden="true" />
            Merge PDFs
          </button>
          <button
            type="button"
            aria-pressed={!isMerging}
            onClick={() => {
              setMode("compress");
              setError("");
              setMessage("");
            }}
            className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${!isMerging ? "bg-white text-teal-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
          >
            <Minimize2 className="h-4 w-4" aria-hidden="true" />
            Compress PDF
          </button>
        </div>

        <div className="grid flex-1 items-start gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
          <section
            className={`flex min-h-[22rem] flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition-colors ${isDragging ? "border-teal-500 ring-2 ring-teal-100" : "border-slate-200"}`}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setIsDragging(false);
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              if (isProcessing) return;
              addFiles(event.dataTransfer.files);
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              multiple={isMerging}
              disabled={isProcessing}
              className="hidden"
              onChange={(event) => {
                if (event.target.files) addFiles(event.target.files);
                event.target.value = "";
              }}
            />
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <h3 className="text-sm font-bold text-slate-700">
                  {isMerging ? "PDF files to merge" : "PDF file"}
                </h3>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  {files.length ? `${files.length} files · ${formatBytes(totalSize)} total` : "PDF · Max 100 MB per file"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                <FilePlus2 className="h-3.5 w-3.5" aria-hidden="true" />
                Add PDF
              </button>
            </div>

            {files.length === 0 ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (isProcessing) return;
                  setIsDragging(true);
                }}
                className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center transition-colors hover:bg-teal-50/40 disabled:cursor-not-allowed"
              >
                <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-600">
                  <Files className="h-6 w-6" aria-hidden="true" />
                </span>
                <span className="text-sm font-bold text-slate-700">Choose PDF files</span>
                <span className="mt-1 text-xs text-slate-400">Or drag and drop them here</span>
                <span className="mt-4 rounded-full bg-slate-100 px-3 py-1 text-[10px] font-medium text-slate-500">
                  Up to {MAX_FILE_COUNT} files · 100 MB each
                </span>
              </button>
            ) : (
              <ol className="flex-1 divide-y divide-slate-100 overflow-y-auto">
                {files.map((item, index) => (
                  <li
                    key={item.id}
                    className={`flex items-center gap-3 px-4 py-3 ${!isMerging && selectedFile?.id === item.id ? "bg-teal-50/70" : ""}`}
                  >
                    {!isMerging && (
                      <input
                        type="radio"
                        name="pdf-compress-file"
                        checked={selectedFile?.id === item.id}
                        onChange={() => setSelectedId(item.id)}
                        aria-label={`Select ${item.file.name} to compress`}
                        className="accent-teal-600"
                      />
                    )}
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-xs font-bold text-rose-600">
                      PDF
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-slate-700">{item.file.name}</span>
                      <span className="mt-0.5 block text-[11px] text-slate-400">{formatBytes(item.file.size)}</span>
                    </span>
                    {isMerging && (
                      <span className="flex items-center">
                        <button
                          type="button"
                          aria-label={`Move ${item.file.name} up`}
                          disabled={index === 0 || isProcessing}
                          onClick={() => moveFile(index, -1)}
                          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                        >
                          <ArrowUp className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Move ${item.file.name} down`}
                          disabled={index === files.length - 1 || isProcessing}
                          onClick={() => moveFile(index, 1)}
                          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                        >
                          <ArrowDown className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </span>
                    )}
                    <button
                      type="button"
                      aria-label={`Remove ${item.file.name}`}
                      disabled={isProcessing}
                      onClick={() => removeFile(item.id)}
                      className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            {isMerging ? (
              <>
                <h3 className="text-sm font-bold text-slate-800">Merge settings</h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  PDFs are combined in the order shown. Use the arrows to reorder them before merging.
                </p>
                <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <p className="text-xs font-semibold text-slate-700">Original pages are preserved</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                    The source files are not changed. The merged PDF is saved as a new file.
                  </p>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-sm font-bold text-slate-800">Compression level</h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  Choose the balance between output size and page clarity.
                </p>
                <div className="mt-4 space-y-2">
                  {COMPRESSION_OPTIONS.map((option) => (
                    <label
                      key={option.id}
                      className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors ${preset === option.id ? "border-teal-300 bg-teal-50/60" : "border-slate-200 hover:bg-slate-50"}`}
                    >
                      <input
                        type="radio"
                        name="pdf-compression"
                        value={option.id}
                        checked={preset === option.id}
                        onChange={() => setPreset(option.id)}
                        disabled={isProcessing}
                        className="mt-0.5 accent-teal-600"
                      />
                      <span>
                        <span className="block text-xs font-semibold text-slate-700">{option.label}</span>
                        <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-500">{option.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-semibold text-amber-900">Please note</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-amber-800">
                    Compression converts each page to an image. Text will no longer be selectable or searchable, and forms, links, and digital signatures are not preserved. Your original PDF remains unchanged.
                  </p>
                </div>
              </>
            )}

            <button
              type="button"
              onClick={() => void handleProcess()}
              disabled={!canProcess || isProcessing}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isProcessing ? (
                <>
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                  {progress
                    ? `Compressing page ${progress.completed} of ${progress.total}…`
                    : isMerging ? "Merging PDFs…" : "Preparing PDF…"}
                </>
              ) : (
                <>
                  {isMerging ? <Files className="h-4 w-4" aria-hidden="true" /> : <Minimize2 className="h-4 w-4" aria-hidden="true" />}
                  {isMerging ? "Merge and save PDF" : "Compress and save PDF"}
                </>
              )}
            </button>

            {error && (
              <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs leading-relaxed text-rose-700">
                {error}
              </p>
            )}
            {message && (
              <p role="status" className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs leading-relaxed text-emerald-700">
                {message}
              </p>
            )}

            <p className="mt-4 text-center text-[10px] leading-relaxed text-slate-400">
              PDF processing happens locally. Files are not uploaded.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
