import { useCallback, useEffect, useRef, useState } from "react";
import type { EditResult } from "../components/ImageEditor";
import { DEFAULT_LAYOUT, DOC_CATEGORIES } from "../constants";
import { paginate } from "../lib/pagination";
import { savePDF } from "../lib/pdf";
import { clearProject, loadProject, serializeProject } from "../lib/projectStorage";
import { notifyUserError } from "../lib/userErrors";
import type { DocCategoryId, LayoutSettings, UploadedDoc } from "../types";

let idCounter = 0;
const genId = () => `doc-${Date.now()}-${++idCounter}`;

export function useProjectState() {
  const [docs, setDocs] = useState<UploadedDoc[]>([]);
  const [blankPageCount, setBlankPageCount] = useState(1);
  const [settings, setSettings] = useState<LayoutSettings>(DEFAULT_LAYOUT);
  const [busy, setBusy] = useState(false);
  const [arrangeMode, setArrangeMode] = useState(false);
  const [defaultCategory, setDefaultCategory] =
    useState<DocCategoryId>("aadhar");
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [showPdfExportDialog, setShowPdfExportDialog] = useState(false);
  const [showExportToast, setShowExportToast] = useState(false);
  const hasHydratedProjectRef = useRef(false);
  const storageFailureNotifiedRef = useRef(false);

  useEffect(() => {
    let active = true;

    void (async () => {
      const restored = await loadProject();
      if (!active) return;

      if (restored) {
        setSettings(restored.settings);
        setDocs(restored.docs);
        setBlankPageCount(
          restored.docs.length === 0
            ? Math.max(1, restored.blankPageCount)
            : restored.blankPageCount,
        );
      }

      hasHydratedProjectRef.current = true;
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hasHydratedProjectRef.current) return;
    void serializeProject(docs, settings, blankPageCount)
      .then(() => {
        storageFailureNotifiedRef.current = false;
      })
      .catch((error: unknown) => {
        console.error("Unable to save project state", error);
        if (!storageFailureNotifiedRef.current) {
          storageFailureNotifiedRef.current = true;
          notifyUserError(
            "Changes couldn't be saved automatically. Free up storage space and try again.",
          );
        }
      });
  }, [blankPageCount, docs, settings]);

  useEffect(() => {
    if (!showExportToast) return;
    const timeout = window.setTimeout(() => setShowExportToast(false), 3000);
    return () => window.clearTimeout(timeout);
  }, [showExportToast]);

  const addFiles = useCallback(
    async (files: File[], targetPageIndex?: number) => {
      const results = await Promise.allSettled(
        files.map(
          (file) =>
            new Promise<UploadedDoc>((resolve, reject) => {
              const url = URL.createObjectURL(file);
              const img = new Image();
              img.onload = () => {
                resolve({
                  id: genId(),
                  fileName: file.name,
                  file,
                  url,
                  pxW: img.naturalWidth,
                  pxH: img.naturalHeight,
                  category: defaultCategory,
                  label: DOC_CATEGORIES[defaultCategory].label,
                  fitToPage: true,
                  widthMm: 190,
                  heightMm: 277,
                });
              };
              img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error(`Could not decode ${file.name}`));
              };
              img.src = url;
            }),
        ),
      );

      const loadedDocs = results.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
      );

      if (loadedDocs.length) {
        const currentPages = paginate(docs, settings, blankPageCount).pages;
        const fillsTrailingBlankPage =
          targetPageIndex !== undefined &&
          targetPageIndex >= currentPages.length - blankPageCount &&
          targetPageIndex < currentPages.length &&
          currentPages[targetPageIndex].length === 0;

        setDocs((prev) => {
          if (targetPageIndex === undefined) {
            return [...prev, ...loadedDocs];
          }

          const pages = paginate(prev, settings, blankPageCount).pages;
          const resolvedPageIndex = Math.min(
            Math.max(0, targetPageIndex),
            pages.length - 1,
          );
          const targetPage = pages[resolvedPageIndex] ?? [];
          const targetDocIds = new Set(
            targetPage.map(({ doc }) => doc.id),
          );
          const lastTargetDocIndex = prev.reduce(
            (lastIndex, doc, index) =>
              targetDocIds.has(doc.id) ? index : lastIndex,
            -1,
          );
          if (lastTargetDocIndex >= 0) {
            const insertAt = lastTargetDocIndex + 1;
            return [
              ...prev.slice(0, insertAt),
              ...loadedDocs,
              ...prev.slice(insertAt),
            ];
          }

          const nextPage = pages
            .slice(resolvedPageIndex + 1)
            .find((page) => page.length > 0);
          const nextDocId = nextPage?.[0].doc.id;
          const nextDocIndex = nextDocId
            ? prev.findIndex((doc) => doc.id === nextDocId)
            : -1;
          const previousPopulatedPage = pages
            .slice(0, resolvedPageIndex)
            .map((page, index) => (page.length > 0 ? index : -1))
            .reduce((lastIndex, index) => Math.max(lastIndex, index), -1);
          const pageBreakCount =
            previousPopulatedPage >= 0
              ? resolvedPageIndex - previousPopulatedPage
              : resolvedPageIndex === 0
                ? 0
                : resolvedPageIndex + 1;
          const insertedDocs = loadedDocs.map((doc, index) => ({
            ...doc,
            pageBreakBefore:
              index === 0 && pageBreakCount > 0
                ? pageBreakCount
                : undefined,
          }));
          const insertAt = nextDocIndex < 0 ? prev.length : nextDocIndex;
          const nextPageBreakCount =
            nextDocIndex < 0
              ? undefined
              : Math.max(1, pages.findIndex((page) => page === nextPage) - resolvedPageIndex);
          const updatedPrev =
            nextDocIndex < 0
              ? prev
              : prev.map((doc, index) =>
                  index === nextDocIndex
                    ? { ...doc, pageBreakBefore: nextPageBreakCount }
                    : doc,
                );
          return [
            ...updatedPrev.slice(0, insertAt),
            ...insertedDocs,
            ...updatedPrev.slice(insertAt),
          ];
        });
        if (fillsTrailingBlankPage) {
          setBlankPageCount((count) => Math.max(0, count - 1));
        }
      }

      const failedFiles = results.flatMap((result, index) =>
        result.status === "rejected" ? [files[index].name] : [],
      );

      if (failedFiles.length) {
        notifyUserError(
          `Could not open ${failedFiles.length === 1 ? "image" : "images"}: ${failedFiles.join(", ")}.`,
        );
      }

      return loadedDocs[0]?.id;
    },
    [blankPageCount, defaultCategory, docs, settings],
  );

  const removeDoc = useCallback((id: string) => {
    setDocs((prev) => {
      const found = prev.find((doc) => doc.id === id);
      if (found) URL.revokeObjectURL(found.url);
      return prev.filter((doc) => doc.id !== id);
    });
  }, []);

  const duplicateDoc = useCallback((id: string) => {
    setDocs((prev) => {
      const found = prev.find((doc) => doc.id === id);
      if (!found) return prev;

      const newUrl = URL.createObjectURL(found.file);
      return [
        ...prev,
        {
          ...found,
          id: genId(),
          url: newUrl,
          label: `${found.label} (copy)`,
          placement: undefined,
        },
      ];
    });
  }, []);

  const reorderDoc = useCallback((id: string, dir: -1 | 1) => {
    setDocs((prev) => {
      const idx = prev.findIndex((doc) => doc.id === id);
      if (idx === -1) return prev;

      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= prev.length) return prev;

      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next;
    });
  }, []);

  const changeLabel = useCallback((id: string, label: string) => {
    setDocs((prev) =>
      prev.map((doc) => (doc.id === id ? { ...doc, label } : doc)),
    );
  }, []);

  const changeDocumentSize = useCallback(
    (
      id: string,
      patch: Pick<UploadedDoc, "fitToPage" | "widthMm" | "heightMm">,
    ) => {
      setDocs((prev) =>
        prev.map((doc) => (doc.id === id ? { ...doc, ...patch } : doc)),
      );
    },
    [],
  );

  const changePlacement = useCallback(
    (id: string, placement: NonNullable<UploadedDoc["placement"]>) => {
      setDocs((prev) =>
        prev.map((doc) => (doc.id === id ? { ...doc, placement } : doc)),
      );
    },
    [],
  );

  const resetPlacements = useCallback(() => {
    setDocs((prev) => prev.map((doc) => ({ ...doc, placement: undefined })));
  }, []);

  const editDoc = useCallback((id: string) => {
    setEditingDocId(id);
  }, []);

  const handleEditSave = useCallback((id: string, result: EditResult) => {
    setDocs((prev) => {
      const found = prev.find((doc) => doc.id === id);
      if (found) URL.revokeObjectURL(found.url);

      return prev.map((doc) =>
        doc.id === id
          ? {
              ...doc,
              file: result.file,
              url: result.url,
              pxW: result.pxW,
              pxH: result.pxH,
            }
          : doc,
      );
    });
  }, []);

  const handleApplyEditToAll = useCallback(
    (results: { id: string; result: EditResult }[]) => {
      const resultById = new Map(results.map(({ id, result }) => [id, result]));
      setDocs((prev) =>
        prev.map((doc) => {
          const result = resultById.get(doc.id);
          if (!result) return doc;

          URL.revokeObjectURL(doc.url);
          return {
            ...doc,
            file: result.file,
            url: result.url,
            pxW: result.pxW,
            pxH: result.pxH,
          };
        }),
      );
    },
    [],
  );

  const updateSettings = useCallback((patch: Partial<LayoutSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const clearAllDocs = useCallback(() => {
    docs.forEach((doc) => URL.revokeObjectURL(doc.url));
    setDocs([]);
    setBlankPageCount(1);
    clearProject();
  }, [docs]);

  const addPage = useCallback(() => {
    setBlankPageCount((count) => count + 1);
  }, []);

  const commitPageGroups = useCallback((pageGroups: UploadedDoc[][]) => {
    const nextDocs: UploadedDoc[] = [];
    let lastPopulatedPage = -1;

    pageGroups.forEach((pageDocs, pageIndex) => {
      if (pageDocs.length === 0) return;

      const pageBreakCount =
        lastPopulatedPage < 0
          ? pageIndex
          : pageIndex - lastPopulatedPage;
      pageDocs.forEach((doc, docIndex) => {
        nextDocs.push({
          ...doc,
          pageBreakBefore:
            docIndex === 0 && pageBreakCount > 0
              ? pageBreakCount
              : undefined,
        });
      });
      lastPopulatedPage = pageIndex;
    });

    setDocs(nextDocs);
    setBlankPageCount(
      Math.max(0, pageGroups.length - lastPopulatedPage - 1),
    );
  }, []);

  const getCurrentPageGroups = useCallback(
    () =>
      paginate(docs, settings, blankPageCount).pages.map((page) =>
        page.map(({ doc }) => doc),
      ),
    [blankPageCount, docs, settings],
  );

  const addPageAfter = useCallback(
    (pageIndex: number) => {
      const pageGroups = getCurrentPageGroups();
      if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= pageGroups.length) {
        return;
      }
      pageGroups.splice(pageIndex + 1, 0, []);
      commitPageGroups(pageGroups);
    },
    [commitPageGroups, getCurrentPageGroups],
  );

  const duplicatePage = useCallback(
    (pageIndex: number) => {
      const pageGroups = getCurrentPageGroups();
      if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= pageGroups.length) {
        return;
      }

      const copies = pageGroups[pageIndex].map((doc) => ({
        ...doc,
        id: genId(),
        url: URL.createObjectURL(doc.file),
        label: `${doc.label} (copy)`,
        pageBreakBefore: undefined,
      }));
      pageGroups.splice(pageIndex + 1, 0, copies);
      commitPageGroups(pageGroups);
    },
    [commitPageGroups, getCurrentPageGroups],
  );

  const movePage = useCallback(
    (pageIndex: number, direction: -1 | 1) => {
      const pageGroups = getCurrentPageGroups();
      const destination = pageIndex + direction;
      if (
        !Number.isInteger(pageIndex) ||
        pageIndex < 0 ||
        pageIndex >= pageGroups.length ||
        destination < 0 ||
        destination >= pageGroups.length
      ) {
        return;
      }

      [pageGroups[pageIndex], pageGroups[destination]] = [
        pageGroups[destination],
        pageGroups[pageIndex],
      ];
      commitPageGroups(pageGroups);
    },
    [commitPageGroups, getCurrentPageGroups],
  );

  const deletePage = useCallback(
    (pageIndex: number) => {
      const pageGroups = getCurrentPageGroups();
      if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= pageGroups.length) {
        return;
      }

      pageGroups[pageIndex].forEach((doc) => URL.revokeObjectURL(doc.url));
      pageGroups.splice(pageIndex, 1);
      commitPageGroups(pageGroups);
    },
    [commitPageGroups, getCurrentPageGroups],
  );

  const handleExport = useCallback(() => {
    if (docs.length === 0 && blankPageCount === 0) return;
    setShowExportToast(false);
    setShowPdfExportDialog(true);
  }, [blankPageCount, docs.length]);

  const handleExportPDF = useCallback(
    async (pdf: Blob) => {
      setShowPdfExportDialog(false);
      if (docs.length === 0 && blankPageCount === 0) return;

      setBusy(true);
      try {
        const ts = new Date().toISOString().slice(0, 10);
        const documentType = DOC_CATEGORIES[defaultCategory].label;
        const saved = await savePDF(pdf, `${documentType}-${ts}.pdf`);
        if (saved) setShowExportToast(true);
      } catch (error) {
        console.error("Unable to save PDF", error);
        notifyUserError(
          "Couldn't save the PDF. Choose a writable location and try again.",
        );
      } finally {
        setBusy(false);
      }
    },
    [blankPageCount, defaultCategory, docs],
  );

  const cancelPdfExport = useCallback(() => {
    setShowPdfExportDialog(false);
  }, []);

  return {
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
    setShowPdfExportDialog,
    setShowExportToast,
    setBusy,
    setSettings,
    setDocs,
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
  };
}
