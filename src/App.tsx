import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BriefcaseBusiness,
  CheckCircle2,
  ChevronDown,
  FileImage,
  Files,
  Github,
  Heart,
  Info,
  Languages,
  Minus,
  ScanFace,
  Square,
  Copy,
  Printer,
  X,
} from "lucide-react";
import { DOC_CATEGORIES } from "./constants";
import { paginate } from "./lib/pagination";
import { notifyUserError } from "./lib/userErrors";
import { useProjectState } from "./hooks/useProjectState";
import UploadZone from "./components/UploadZone";
import ErrorPopup from "./components/ErrorPopup";
import DocTray from "./components/DocTray";
import A4Page from "./components/A4Page";
import ControlPanel from "./components/ControlPanel";
import ImageEditor from "./components/ImageEditor";
import PdfExportDialog from "./components/PdfExportDialog";
import AboutDialog from "./components/AboutDialog";
import DonationDialog from "./components/DonationDialog";
import UpdateDialog from "./components/UpdateDialog";
import PassportPhotoMaker from "./components/PassportPhotoMaker";
import ImageTools from "./components/ImageTools";
import PhotoBackgroundRemover from "./components/PhotoBackgroundRemover";
import ResumeMaker from "./components/ResumeMaker";
import ApplicationMaker from "./components/ApplicationMaker";
import PdfTools from "./components/PdfTools";
import type { UpdateStatus } from "./types";

function App() {
  const {
    docs,
    blankPageCount,
    settings,
    busy,
    arrangeMode,
    defaultCategory,
    editingDocId,
    showPdfExportDialog,
    showExportToast,
    setArrangeMode,
    setDefaultCategory,
    setEditingDocId,
    addFiles,
    addPage,
    addPageAfter,
    duplicatePage,
    movePage,
    deletePage,
    removeDoc,
    duplicateDoc,
    reorderDoc,
    changeLabel,
    changeDocumentSize,
    changePlacement,
    resetPlacements,
    editDoc,
    handleEditSave,
    handleApplyEditToAll,
    updateSettings,
    clearAllDocs,
    handleExport,
    handleExportPDF,
    cancelPdfExport,
  } = useProjectState();

  const [isMaximized, setIsMaximized] = useState(false);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [showAboutDialog, setShowAboutDialog] = useState(false);
  const [showDonationDialog, setShowDonationDialog] = useState(false);
  const [showPassportPhotoMaker, setShowPassportPhotoMaker] = useState(false);
  const [showImageTools, setShowImageTools] = useState(false);
  const [showPhotoBackgroundRemover, setShowPhotoBackgroundRemover] = useState(false);
  const [showResumeMaker, setShowResumeMaker] = useState(false);
  const [showApplicationMaker, setShowApplicationMaker] = useState(false);
  const [showPdfTools, setShowPdfTools] = useState(false);
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const toolsMenuRef = useRef<HTMLDivElement>(null);
  const [isUpdateDialogDismissed, setIsUpdateDialogDismissed] = useState(false);
  const [updateDownloadState, setUpdateDownloadState] = useState<
    "idle" | "downloading" | "installing" | "error"
  >("idle");
  const [updateProgress, setUpdateProgress] = useState(0);
  const [isScanning, setIsScanning] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({
    state: "checking",
  });
  const desktopAPI = window.desktopAPI;

  const handleScan = useCallback(async () => {
    if (!desktopAPI) return;

    setIsScanning(true);
    try {
      const result = await desktopAPI.scanDocument();
      if (!result.canceled) {
        const scannedFile = new File([result.bytes], result.fileName, {
          type: "image/jpeg",
        });
        const addedDocId = await addFiles([scannedFile], activePageIndex);
        if (addedDocId) setEditingDocId(addedDocId);
      }
    } catch (error) {
      console.error("Unable to scan document", error);
      const details = error instanceof Error ? error.message : "";
      if (/did not respond within 3 minutes/i.test(details)) {
        notifyUserError(
          "The printer didn't respond. Make sure it's on and connected, then try again.",
        );
      } else if (
        /wia device|scanner.*(not found|unavailable|not ready)|device.*(not found|unavailable|not ready)/i.test(
          details,
        )
      ) {
        notifyUserError(
          "Couldn't connect to the printer. Make sure it's turned on and connected, then try again.",
        );
      } else {
        notifyUserError(
          "The scan couldn't be completed. Check that the printer is on and connected, then try again.",
        );
      }
    } finally {
      setIsScanning(false);
    }
  }, [activePageIndex, addFiles, desktopAPI, setEditingDocId]);

  const checkForUpdates = useCallback(async () => {
    if (!desktopAPI) {
      setUpdateStatus({ state: "error" });
      return;
    }

    setUpdateStatus({ state: "checking" });
    try {
      const latestRelease = await desktopAPI.checkUpdates();
      const latestVersion = latestRelease.tag.replace(/^v/, "");
      const currentParts = __APP_VERSION__.split(".").map(Number);
      const latestParts = latestVersion.split(".").map(Number);
      const hasNewerVersion =
        latestParts.length === currentParts.length &&
        latestParts.every(Number.isInteger) &&
        latestParts.some(
          (part, index) =>
            part > currentParts[index] &&
            latestParts
              .slice(0, index)
              .every((previousPart, previousIndex) =>
                previousPart === currentParts[previousIndex],
              ),
        );

      setUpdateStatus({
        state: hasNewerVersion ? "available" : "current",
        tag: latestRelease.tag,
        publishedAt: latestRelease.publishedAt,
        installerUrl: latestRelease.installerUrl,
      });
    } catch (error) {
      console.error("Unable to check for updates", error);
      setUpdateStatus({ state: "error" });
    }
  }, [desktopAPI]);

  useEffect(() => {
    if (desktopAPI) void checkForUpdates();
  }, [checkForUpdates, desktopAPI]);

  useEffect(() => {
    if (!showToolsMenu) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !toolsMenuRef.current?.contains(event.target)
      ) {
        setShowToolsMenu(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowToolsMenu(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showToolsMenu]);

  useEffect(() => {
    if (!desktopAPI) return;

    const unsubscribeProgress = desktopAPI.onUpdateProgress((percent) => {
      setUpdateProgress(Math.max(0, Math.min(100, percent)));
    });
    const unsubscribeInstalling = desktopAPI.onUpdateInstalling(() => {
      setUpdateDownloadState("installing");
    });
    const unsubscribeError = desktopAPI.onUpdateError(() => {
      setUpdateDownloadState("error");
      notifyUserError(
        "Couldn't install the update. Check your internet connection and try again.",
      );
    });

    return () => {
      unsubscribeProgress();
      unsubscribeInstalling();
      unsubscribeError();
    };
  }, [desktopAPI]);

  useEffect(() => {
    if (!desktopAPI) return;

    let active = true;
    const unsubscribe = desktopAPI.onMaximizeChange(setIsMaximized);
    void desktopAPI
      .isMaximized()
      .then((maximized) => {
        if (active) setIsMaximized(maximized);
      })
      .catch((error: unknown) =>
        console.error("Unable to read window state", error),
      );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [desktopAPI]);

  const { pages } = useMemo(
    () => paginate(docs, settings, blankPageCount),
    [blankPageCount, docs, settings],
  );
  const pageCount = pages.length;

  useEffect(() => {
    setActivePageIndex((current) =>
      Math.min(current, Math.max(0, pageCount - 1)),
    );
  }, [pageCount]);

  const handleAddPage = () => {
    setActivePageIndex(pageCount);
    addPage();
  };

  const handleAddPageAfter = (pageIndex: number) => {
    addPageAfter(pageIndex);
    setActivePageIndex(pageIndex + 1);
  };

  const handleDuplicatePage = (pageIndex: number) => {
    duplicatePage(pageIndex);
    setActivePageIndex(pageIndex + 1);
  };

  const handleDeletePage = (pageIndex: number) => {
    if (pageIndex === 0) return;
    deletePage(pageIndex);
    setActivePageIndex((current) =>
      current > pageIndex
        ? current - 1
        : Math.max(0, Math.min(current, pageCount - 2)),
    );
  };

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;

      switch (event.key.toLowerCase()) {
        case "s":
          event.preventDefault();
          void handleExport();
          break;
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [handleExport]);

  return (
    <>
      <ErrorPopup />
      <div className="screen-shell flex h-dvh flex-col overflow-hidden bg-slate-50">
        <header className="app-titlebar sticky top-0 z-30 flex h-10 shrink-0 items-center justify-between border-b border-slate-200 bg-white/90 pl-3 backdrop-blur-lg">
          <div className="flex items-center gap-2">
            <img
              src="./cyber_cafe_studio_teal.svg"
              alt=""
              className="h-5 w-5"
              aria-hidden="true"
            />
            <h1 className="text-sm font-bold tracking-tight text-slate-800">
              Cyber Cafe Studio
            </h1>
          </div>
          <div className="flex h-full items-center">
            <div className="relative mr-2" ref={toolsMenuRef}>
              <button
                type="button"
                aria-expanded={showToolsMenu}
                aria-controls="tools-menu"
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  showToolsMenu ||
                  showPassportPhotoMaker ||
                  showImageTools ||
                  showPhotoBackgroundRemover ||
                  showResumeMaker ||
                  showApplicationMaker ||
                  showPdfTools
                    ? "bg-teal-600 text-white"
                    : "bg-teal-50 text-teal-700 hover:bg-teal-100"
                }`}
                onClick={() => setShowToolsMenu((current) => !current)}
              >
                Tools
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${showToolsMenu ? "rotate-180" : ""}`}
                  aria-hidden="true"
                />
              </button>
              {showToolsMenu && (
                <div
                  id="tools-menu"
                  role="region"
                  aria-label="Tools"
                  className="absolute right-0 top-full z-50 mt-2 w-[min(21rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 text-left shadow-xl"
                >
                  <div className="px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Image &amp; photo
                  </div>
                  <button
                    type="button"
                    aria-current={showPassportPhotoMaker ? "page" : undefined}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-teal-50"
                    onClick={() => {
                      setShowPassportPhotoMaker(true);
                      setShowImageTools(false);
                      setShowPhotoBackgroundRemover(false);
                      setShowResumeMaker(false);
                      setShowApplicationMaker(false);
                      setShowPdfTools(false);
                      setShowToolsMenu(false);
                    }}
                  >
                    <Printer className="h-4 w-4 shrink-0 text-teal-600" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold text-slate-800">
                        Passport Photo Maker
                      </span>
                      <span className="mt-0.5 block text-[11px] text-slate-500">
                        Arrange and print passport photos
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-current={showImageTools ? "page" : undefined}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-teal-50"
                    onClick={() => {
                      setShowImageTools(true);
                      setShowPassportPhotoMaker(false);
                      setShowPhotoBackgroundRemover(false);
                      setShowResumeMaker(false);
                      setShowApplicationMaker(false);
                      setShowPdfTools(false);
                      setShowToolsMenu(false);
                    }}
                  >
                    <FileImage className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold text-slate-700">Image Tools</span>
                      <span className="mt-0.5 block text-[11px] text-slate-500">
                        Resize • Compress • Crop • Convert
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-current={showPhotoBackgroundRemover ? "page" : undefined}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-teal-50"
                    onClick={() => {
                      setShowPhotoBackgroundRemover(true);
                      setShowPassportPhotoMaker(false);
                      setShowImageTools(false);
                      setShowResumeMaker(false);
                      setShowApplicationMaker(false);
                      setShowPdfTools(false);
                      setShowToolsMenu(false);
                    }}
                  >
                    <ScanFace className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold text-slate-700">
                        Photo Background Remover
                      </span>
                      <span className="mt-0.5 block text-[11px] text-slate-500">
                        Portrait cutouts · local AI
                      </span>
                    </span>
                  </button>

                  <div className="mx-2 my-1 border-t border-slate-100" />
                  <div className="px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Documents
                  </div>
                  <button
                    type="button"
                    aria-current={showResumeMaker ? "page" : undefined}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-teal-50"
                    onClick={() => {
                      setShowResumeMaker(true);
                      setShowPassportPhotoMaker(false);
                      setShowImageTools(false);
                      setShowPhotoBackgroundRemover(false);
                      setShowToolsMenu(false);
                      setShowApplicationMaker(false);
                      setShowPdfTools(false);
                    }}
                  >
                    <BriefcaseBusiness className="h-4 w-4 shrink-0 text-teal-600" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold text-slate-800">Resume Maker</span>
                      <span className="mt-0.5 block text-[11px] text-slate-500">
                        Create and download a resume as PDF
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-current={showApplicationMaker ? "page" : undefined}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-teal-50"
                    onClick={() => {
                      setShowApplicationMaker(true);
                      setShowPassportPhotoMaker(false);
                      setShowImageTools(false);
                      setShowPhotoBackgroundRemover(false);
                      setShowResumeMaker(false);
                      setShowToolsMenu(false);
                      setShowPdfTools(false);
                    }}
                  >
                    <Languages className="h-4 w-4 shrink-0 text-teal-600" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold text-slate-800">Application Maker</span>
                      <span className="mt-0.5 block text-[11px] text-slate-500">
                        Bank • School • Government office • Bangla / English
                      </span>
                    </span>
                  </button>

                  <div className="mx-2 my-1 border-t border-slate-100" />
                  <div className="px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    PDF
                  </div>
                  <button
                    type="button"
                    aria-current={showPdfTools ? "page" : undefined}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-teal-50"
                    onClick={() => {
                      setShowPdfTools(true);
                      setShowPassportPhotoMaker(false);
                      setShowImageTools(false);
                      setShowPhotoBackgroundRemover(false);
                      setShowResumeMaker(false);
                      setShowApplicationMaker(false);
                      setShowToolsMenu(false);
                    }}
                  >
                    <Files className="h-4 w-4 shrink-0 text-teal-600" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold text-slate-800">PDF Tools</span>
                      <span className="mt-0.5 block text-[11px] text-slate-500">
                        Merge and compress PDF files
                      </span>
                    </span>
                  </button>
                </div>
              )}
            </div>
            <button
              type="button"
              aria-label="Donate"
              aria-haspopup="dialog"
              title="Donate"
              className="group mx-2 flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-100 hover:text-rose-700"
              onClick={() => setShowDonationDialog(true)}
            >
              <Heart className="h-3.5 w-3.5 transition-all group-hover:fill-current" aria-hidden="true" />
              Donate
            </button>
            <a
              href="https://github.com/tuhin733/cyber-cafe-studio"
              target="_blank"
              rel="noreferrer"
              aria-label="Open the Cyber Cafe Studio project repository on GitHub"
              title="Open project repository"
              className="group flex h-full w-10 items-center justify-center text-slate-500"
              onClick={(event) => {
                if (!desktopAPI) return;
                event.preventDefault();
                void desktopAPI
                  .openRepository()
                  .catch((error: unknown) => {
                    console.error("Unable to open project repository", error);
                    notifyUserError(
                      "Couldn't open the Cyber Cafe Studio repository. Check your internet connection and try again.",
                    );
                  });
              }}
            >
              <Github
                className="h-4 w-4 transition-colors group-hover:text-slate-800"
                aria-hidden="true"
              />
            </a>
            {desktopAPI && (
              <div className="app-window-controls flex h-full">
                <button
                  type="button"
                  aria-label="Minimize window"
                  title="Minimize"
                  onClick={() => void desktopAPI.minimize()}
                >
                  <Minus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label={isMaximized ? "Restore window" : "Maximize window"}
                  title={isMaximized ? "Restore" : "Maximize"}
                  onClick={() => void desktopAPI.toggleMaximize()}
                >
                  {isMaximized ? (
                    <Copy className="h-3.5 w-3.5" />
                  ) : (
                    <Square className="h-3.5 w-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  className="close-control"
                  aria-label="Close window"
                  title="Close"
                  onClick={() => void desktopAPI.close()}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </header>

        {showPassportPhotoMaker ? (
          <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            <PassportPhotoMaker
              onClose={() => setShowPassportPhotoMaker(false)}
            />
          </main>
        ) : showImageTools ? (
          <ImageTools onClose={() => setShowImageTools(false)} />
        ) : showPhotoBackgroundRemover ? (
          <PhotoBackgroundRemover
            onClose={() => setShowPhotoBackgroundRemover(false)}
          />
        ) : showResumeMaker ? (
          <ResumeMaker onClose={() => setShowResumeMaker(false)} />
        ) : showApplicationMaker ? (
          <ApplicationMaker onClose={() => setShowApplicationMaker(false)} />
        ) : showPdfTools ? (
          <PdfTools onClose={() => setShowPdfTools(false)} />
        ) : (
          <>
        <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 w-full max-w-7xl flex-1 self-center px-3 sm:px-4">
            <div className="grid h-full min-h-0 grid-cols-1 items-stretch gap-4 min-[900px]:grid-cols-[260px_minmax(0,1fr)_240px] lg:grid-cols-[300px_minmax(0,1fr)_260px]">
              <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden py-3">
                <div>
                  <label className="text-sm font-bold text-slate-700 pb-1 block" htmlFor="default-category">
                    Document type
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.values(DOC_CATEGORIES).map((category) => (
                      <button
                        key={category.id}
                        type="button"
                        aria-pressed={defaultCategory === category.id}
                        onClick={() => setDefaultCategory(category.id)}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all ${
                          defaultCategory === category.id
                            ? "text-white shadow-sm"
                            : "bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50"
                        }`}
                        style={
                          defaultCategory === category.id
                            ? { background: category.accent }
                            : undefined
                        }
                      >
                        {category.label}
                      </button>
                    ))}
                  </div>
                </div>

                <UploadZone
                  onFiles={(files) => addFiles(files, activePageIndex)}
                  onScan={desktopAPI ? () => void handleScan() : undefined}
                  isScanning={isScanning}
                  documentMode={defaultCategory === "document"}
                />

                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="text-sm font-bold text-slate-700">
                      Documents{" "}
                      <span className="ml-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
                        {docs.length}
                      </span>
                    </h2>
                    {docs.length > 0 && (
                      <button
                        type="button"
                        onClick={clearAllDocs}
                        className="text-xs font-medium text-red-500 hover:text-red-600"
                      >
                        Clear all
                      </button>
                    )}
                  </div>

                  <DocTray
                    docs={docs}
                    onRemove={removeDoc}
                    onDuplicate={duplicateDoc}
                    onReorder={reorderDoc}
                    onLabelChange={changeLabel}
                    onDocumentSizeChange={changeDocumentSize}
                    onEdit={editDoc}
                  />
                </div>
              </div>

              <div className="relative h-full min-h-0 min-w-0 overflow-hidden">
                <A4Page
                  docs={docs}
                  settings={settings}
                  blankPageCount={blankPageCount}
                  onPlacementChange={changePlacement}
                  arrangeMode={arrangeMode}
                  onAddPage={handleAddPage}
                  onAddPageAfter={handleAddPageAfter}
                  onDuplicatePage={handleDuplicatePage}
                  onDeletePage={handleDeletePage}
                  onMovePage={movePage}
                  activePageIndex={activePageIndex}
                  onPageSelect={setActivePageIndex}
                />
              </div>

              <div className="h-full min-h-0 py-3">
                <div className="h-full min-h-0 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <ControlPanel
                    settings={settings}
                    onChange={updateSettings}
                    documentMode={defaultCategory === "document"}
                    onExport={handleExport}
                    busy={busy}
                    cardCount={docs.length}
                    pageCount={pageCount}
                    arrangeMode={arrangeMode}
                    onArrangeModeChange={setArrangeMode}
                    onResetPlacements={resetPlacements}
                  />
                </div>
              </div>
            </div>
          </div>
        </main>
        <footer className="relative z-10 flex h-9 shrink-0 items-center justify-between border-t border-slate-200 bg-white px-3 text-[11px] text-slate-500 shadow-[0_-2px_8px_rgba(15,23,42,0.04)]">
          {isScanning && (
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-emerald-100"
              role="progressbar"
              aria-label="Scanning document"
              aria-valuetext="Scan in progress"
            >
              <div className="scan-progress-indicator h-full w-1/3 bg-emerald-500" />
            </div>
          )}
          <span className="font-semibold">Version {__APP_VERSION__}</span>
          <button
            type="button"
            aria-label="About Cyber Cafe Studio"
            aria-haspopup="dialog"
            title="About Cyber Cafe Studio"
            className="group flex h-8 w-8 items-center justify-center rounded-md text-slate-500"
            onClick={() => setShowAboutDialog(true)}
          >
            <Info
              className="h-4 w-4 transition-colors group-hover:text-slate-800"
              aria-hidden="true"
            />
          </button>
        </footer>
          </>
        )}
      </div>

      {showExportToast && (
        <div
          className="fixed bottom-5 right-5 z-[60] flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-lg"
          role="status"
          aria-live="polite"
        >
          <CheckCircle2 className="h-5 w-5 text-white" />
          Exported Successfully
        </div>
      )}

      {editingDocId && (
        <ImageEditor
          key={editingDocId}
          docs={docs}
          doc={docs.find((doc) => doc.id === editingDocId)!}
          onSave={handleEditSave}
          onSelectDoc={setEditingDocId}
          onApplyToAll={handleApplyEditToAll}
          onClose={() => setEditingDocId(null)}
        />
      )}

      {showPdfExportDialog && (
        <PdfExportDialog
          docs={docs}
          settings={settings}
          blankPageCount={blankPageCount}
          onExport={handleExportPDF}
          onCancel={cancelPdfExport}
        />
      )}

      {showAboutDialog && (
        <AboutDialog
          onClose={() => setShowAboutDialog(false)}
        />
      )}

      {showDonationDialog && (
        <DonationDialog onClose={() => setShowDonationDialog(false)} />
      )}

      {updateStatus.state === "available" && !isUpdateDialogDismissed && (
        <UpdateDialog
          version={updateStatus.tag}
          downloadState={updateDownloadState}
          progress={updateProgress}
          installerUrl={updateStatus.installerUrl}
          onManualDownload={() => {
            if (!desktopAPI || !updateStatus.installerUrl) return;
            void desktopAPI
              .openInstallerDownload(updateStatus.installerUrl)
              .catch((error: unknown) => {
                console.error("Unable to open installer download", error);
                notifyUserError(
                  "Couldn't open the installer download. Check your internet connection and try again.",
                );
              });
          }}
          onUpdate={() => {
            if (
              updateStatus.state !== "available" ||
              updateDownloadState === "downloading" ||
              updateDownloadState === "installing"
            ) {
              return;
            }
            if (!desktopAPI) {
              setUpdateDownloadState("error");
              notifyUserError(
                "In-app updates are only available in the installed desktop app.",
              );
              return;
            }
            setUpdateDownloadState("downloading");
            setUpdateProgress(0);
            void desktopAPI
              .downloadUpdate(updateStatus.tag)
              .then(() => setUpdateDownloadState("installing"))
              .catch((error: unknown) => {
                console.error("Unable to install update", error);
                setUpdateDownloadState("error");
                notifyUserError(
                  "Couldn't install the update. Check your internet connection and try again.",
                );
              });
          }}
          onLater={() => setIsUpdateDialogDismissed(true)}
        />
      )}
    </>
  );
}

export default App;
