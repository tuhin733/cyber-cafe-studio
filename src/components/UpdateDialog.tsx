import { Download, Loader2 } from "lucide-react";

interface Props {
  version: string;
  downloadState: "idle" | "downloading" | "installing" | "error";
  progress: number;
  installerUrl?: string;
  onUpdate: () => void;
  onManualDownload: () => void;
  onLater: () => void;
}

export default function UpdateDialog({
  version,
  downloadState,
  progress,
  installerUrl,
  onUpdate,
  onManualDownload,
  onLater,
}: Props) {
  const isBusy =
    downloadState === "downloading" || downloadState === "installing";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-title"
        aria-describedby="update-description"
        className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl ring-1 ring-slate-900/10"
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 text-teal-700">
          <Download className="h-6 w-6" aria-hidden="true" />
        </div>
        <h2
          id="update-title"
          className="mt-4 text-lg font-bold tracking-tight text-slate-800"
        >
          Update available
        </h2>
        <p id="update-description" className="mt-2 text-sm text-slate-500">
          Cyber Cafe Studio {version} is ready to download.
        </p>
        {downloadState === "downloading" && (
          <div className="mt-5">
            <div
              role="progressbar"
              aria-label="Downloading update"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress)}
              className="h-2 overflow-hidden rounded-full bg-slate-100"
            >
              <div
                className="h-full rounded-full bg-teal-600 transition-[width]"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Downloading update... {Math.round(progress)}%
            </p>
          </div>
        )}
        {downloadState === "installing" && (
          <p className="mt-4 text-sm text-teal-700" role="status">
            Installing update and restarting Cyber Cafe Studio...
          </p>
        )}
        {downloadState === "error" && (
          <p className="mt-4 text-sm text-rose-700" role="alert">
            Automatic update failed. You can retry or download the installer
            manually below.
          </p>
        )}
        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            onClick={onLater}
            disabled={isBusy}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
          >
            Later
          </button>
          <button
            type="button"
            onClick={onUpdate}
            disabled={isBusy}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-800 disabled:cursor-wait disabled:opacity-70"
          >
            {isBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="h-4 w-4" aria-hidden="true" />
            )}
            {downloadState === "downloading"
              ? "Downloading"
              : downloadState === "installing"
                ? "Installing"
                : downloadState === "error"
                  ? "Retry update"
                  : "Update"}
          </button>
        </div>
        {downloadState === "error" && installerUrl && (
          <button
            type="button"
            onClick={onManualDownload}
            className="mt-4 text-sm font-semibold text-teal-700 underline underline-offset-2 hover:text-teal-800"
          >
            Download installer manually
          </button>
        )}
      </section>
    </div>
  );
}
