import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  ImagePlus,
  Printer,
  RotateCcw,
  RotateCw,
  Scissors,
  Trash2,
} from "lucide-react";
import { getSheetLayout, PAPER_SIZE_PRESETS, PHOTO_SIZE_PRESETS } from "../lib/passportPhotos";
import type { SheetLayout } from "../lib/passportPhotos";
import { notifyUserError } from "../lib/userErrors";

interface PhotoItem {
  id: string;
  file: File;
  url: string;
  image: HTMLImageElement;
  width: number;
  height: number;
  copies: number;
  rotation: number;
}

interface Props {
  onClose: () => void;
}

const DEFAULT_DPI = 300;
const MAX_SHEET_PIXELS = 32_000_000;

function loadImage(file: File): Promise<{ url: string; image: HTMLImageElement }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ url, image });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Unable to open ${file.name}. The image may be damaged or unsupported.`));
    };
    image.src = url;
  });
}

function renderPhoto(
  photo: PhotoItem,
  widthPx: number,
  heightPx: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = widthPx;
  canvas.height = heightPx;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image processing is unavailable.");

  const isSideways = photo.rotation % 180 !== 0;
  const rotatedWidth = isSideways ? photo.height : photo.width;
  const rotatedHeight = isSideways ? photo.width : photo.height;
  const scale = Math.max(widthPx / rotatedWidth, heightPx / rotatedHeight);
  context.translate(widthPx / 2, heightPx / 2);
  context.rotate(photo.rotation * Math.PI / 180);
  context.drawImage(
    photo.image,
    -photo.width * scale / 2,
    -photo.height * scale / 2,
    photo.width * scale,
    photo.height * scale,
  );
  return canvas;
}

function mmToPixels(mm: number, dpi: number) {
  return Math.round(mm * dpi / 25.4);
}

function getCanvasSize(widthMm: number, heightMm: number, dpi: number) {
  const width = mmToPixels(widthMm, dpi);
  const height = mmToPixels(heightMm, dpi);
  if (!Number.isSafeInteger(width * height) || width * height > MAX_SHEET_PIXELS) {
    throw new RangeError(`This paper size is too large to render at ${dpi} DPI. Reduce the paper dimensions or output resolution.`);
  }
  return { width, height };
}

function drawSheet(
  canvas: HTMLCanvasElement,
  layout: SheetLayout,
  photos: PhotoItem[],
  widthMm: number,
  heightMm: number,
  border: boolean,
  dpi: number,
  guides = false,
) {
  const width = Math.round(widthMm * dpi / 25.4);
  const height = Math.round(heightMm * dpi / 25.4);
  if (width * height > MAX_SHEET_PIXELS) {
    throw new RangeError(`The sheet exceeds the ${MAX_SHEET_PIXELS.toLocaleString()} pixel output limit.`);
  }
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Print preview is unavailable.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);

  const photoCanvases = new Map<string, HTMLCanvasElement>();
  for (const placement of layout.placements) {
    let photoCanvas = photoCanvases.get(placement.photoId);
    if (!photoCanvas) {
      const photo = photos.find((item) => item.id === placement.photoId);
      if (!photo) throw new Error("A selected photo is unavailable.");
      photoCanvas = renderPhoto(
        photo,
        Math.max(1, Math.round(placement.widthMm * dpi / 25.4)),
        Math.max(1, Math.round(placement.heightMm * dpi / 25.4)),
      );
      photoCanvases.set(placement.photoId, photoCanvas);
    }
    const x = placement.xMm * dpi / 25.4;
    const y = placement.yMm * dpi / 25.4;
    const photoWidth = placement.widthMm * dpi / 25.4;
    const photoHeight = placement.heightMm * dpi / 25.4;
    context.drawImage(photoCanvas, x, y, photoWidth, photoHeight);
    if (border) {
      context.save();
      context.strokeStyle = "#334155";
      context.lineWidth = Math.max(1, dpi / 25.4 * 0.2);
      context.strokeRect(x, y, photoWidth, photoHeight);
      context.restore();
    }
    if (guides) {
      context.save();
      context.strokeStyle = "rgba(13, 148, 136, 0.75)";
      context.setLineDash([Math.max(1, dpi / 25.4), Math.max(1, dpi / 25.4)]);
      context.lineWidth = Math.max(1, dpi / 25.4 * 0.15);
      context.strokeRect(x, y, photoWidth, photoHeight);
      context.restore();
    }
  }
}

function saveCanvas(canvas: HTMLCanvasElement, mimeType: string, filename: string) {
  canvas.toBlob((blob) => {
    if (!blob) {
      notifyUserError("Couldn't create the image file. Try a smaller sheet.");
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, mimeType, 0.96);
}

function mmInputClass() {
  return "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-700 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100";
}

export default function PassportPhotoMaker({ onClose }: Props) {
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [photoSizePreset, setPhotoSizePreset] = useState("35x45");
  const [photoWidthMm, setPhotoWidthMm] = useState(35);
  const [photoHeightMm, setPhotoHeightMm] = useState(45);
  const [aspectLocked, setAspectLocked] = useState(true);
  const [paperWidthMm, setPaperWidthMm] = useState(210);
  const [paperHeightMm, setPaperHeightMm] = useState(297);
  const [marginMm, setMarginMm] = useState(5);
  const [spacingMm, setSpacingMm] = useState(3);
  const [rows, setRows] = useState(0);
  const [columns, setColumns] = useState(0);
  const [customPaper, setCustomPaper] = useState(false);
  const [showBorders, setShowBorders] = useState(true);
  const [showGuides, setShowGuides] = useState(false);
  const [targetDpi, setTargetDpi] = useState(DEFAULT_DPI);
  const [pageIndex, setPageIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [printers, setPrinters] = useState<Array<{ name: string; displayName: string }>>([]);
  const [printerName, setPrinterName] = useState("");
  const [sheetCopies, setSheetCopies] = useState(1);
  const [printColor, setPrintColor] = useState(true);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const exportRef = useRef<HTMLCanvasElement>(null);
  const photosRef = useRef(photos);
  photosRef.current = photos;
  const desktopAPI = window.desktopAPI;
  const selectedPhoto = photos.find((photo) => photo.id === selectedId);

  const layoutResult = useMemo(() => {
    try {
      return {
        layout: getSheetLayout({
          paperWidthMm,
          paperHeightMm,
          photoWidthMm,
          photoHeightMm,
          marginMm,
          spacingMm,
          rows,
          columns,
          photos: photos.map(({ id, copies }) => ({ id, copies })),
          pageIndex,
        }),
        error: "",
      };
    } catch (error) {
      return {
        layout: null,
        error: error instanceof Error ? error.message : "The sheet layout is invalid.",
      };
    }
  }, [columns, marginMm, pageIndex, paperHeightMm, paperWidthMm, photoHeightMm, photoWidthMm, photos, rows, spacingMm]);
  const layout = layoutResult.layout;

  useEffect(() => {
    setPageIndex((current) => Math.min(current, Math.max(0, (layout?.pageCount ?? 1) - 1)));
  }, [layout?.pageCount]);

  const updatePhoto = useCallback((id: string, changes: Partial<PhotoItem>) => {
    setPhotos((current) => current.map((photo) => photo.id === id ? { ...photo, ...changes } : photo));
  }, []);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const selectedFiles = Array.from(files);
    if (!selectedFiles.length) return;
    const valid = selectedFiles.filter((file) => {
      const extensionAllowed = /\.(jpe?g|png|webp)$/i.test(file.name);
      const mimeAllowed = ["image/jpeg", "image/png", "image/webp"].includes(file.type);
      return extensionAllowed && mimeAllowed && file.size > 0;
    });
    if (valid.length !== selectedFiles.length) {
      notifyUserError("Choose valid JPG, PNG, or WebP image files.");
    }
    const loaded: PhotoItem[] = [];
    for (const file of valid) {
      try {
        const { url, image } = await loadImage(file);
        loaded.push({
          id: crypto.randomUUID(),
          file,
          url,
          image,
          width: image.naturalWidth,
          height: image.naturalHeight,
          copies: 6,
          rotation: 0,
        });
      } catch (error) {
        console.error("Unable to load photo", error);
        notifyUserError(error instanceof Error ? error.message : "An image couldn't be opened.");
      }
    }
    if (loaded.length) {
      setPhotos((current) => [...current, ...loaded]);
      setSelectedId((current) => current || loaded[0].id);
    }
  }, []);

  const removePhoto = (id: string) => {
    const remaining = photos.filter((photo) => photo.id !== id);
    setPhotos(remaining);
    if (selectedId === id) setSelectedId(remaining[0]?.id ?? "");
    const removed = photos.find((photo) => photo.id === id);
    if (removed) URL.revokeObjectURL(removed.url);
  };

  const pageSize = useMemo(() => {
    try {
      return { size: getCanvasSize(paperWidthMm, paperHeightMm, targetDpi), error: "" };
    } catch (error) {
      return {
        size: null,
        error: error instanceof Error ? error.message : "The selected paper is too large.",
      };
    }
  }, [paperHeightMm, paperWidthMm, targetDpi]);

  useEffect(() => {
    if (!layout || !previewRef.current || !pageSize.size) return;
    try {
      const maxPreviewWidth = 900;
      const maxPreviewHeight = 920;
      const scale = Math.min(maxPreviewWidth / pageSize.size.width, maxPreviewHeight / pageSize.size.height);
      const canvas = previewRef.current;
      drawSheet(
        canvas,
        layout,
        photos,
        paperWidthMm,
        paperHeightMm,
        showBorders,
        Math.max(20, Math.round(targetDpi * scale)),
      );
      if (showGuides) {
        const context = canvas.getContext("2d");
        if (context) {
          context.save();
          context.strokeStyle = "rgba(13, 148, 136, 0.65)";
          context.setLineDash([5, 5]);
          context.lineWidth = 1;
          const positions = layout.placements;
          for (const placement of positions) {
            const x = placement.xMm * canvas.width / paperWidthMm;
            const y = placement.yMm * canvas.height / paperHeightMm;
            const w = placement.widthMm * canvas.width / paperWidthMm;
            const h = placement.heightMm * canvas.height / paperHeightMm;
            context.strokeRect(x, y, w, h);
          }
          context.restore();
        }
      }
      setPreviewError("");
    } catch (error) {
      console.error("Unable to render photo sheet", error);
      setPreviewError(error instanceof Error ? error.message : "The sheet preview couldn't be rendered.");
    }
  }, [layout, pageSize, photos, paperHeightMm, paperWidthMm, showBorders, showGuides, targetDpi]);

  useEffect(() => () => {
    for (const photo of photosRef.current) URL.revokeObjectURL(photo.url);
  }, []);

  useEffect(() => {
    if (!desktopAPI) return;
    let active = true;
    void desktopAPI.getPrinters()
      .then((availablePrinters) => {
        if (!active) return;
        setPrinters(availablePrinters);
        setPrinterName((current) =>
          availablePrinters.some((printer) => printer.name === current)
            ? current
            : (availablePrinters[0]?.name ?? ""),
        );
      })
      .catch((error: unknown) => {
        console.error("Unable to list printers", error);
        notifyUserError("Couldn't load installed printers. Check the Windows print spooler and try again.");
      });
    return () => {
      active = false;
    };
  }, [desktopAPI]);

  const updatePaperPreset = (id: string) => {
    if (id === "custom") {
      setCustomPaper(true);
      return;
    }
    const preset = PAPER_SIZE_PRESETS.find((item) => item.id === id);
    if (!preset) return;
    setCustomPaper(false);
    setPaperWidthMm(preset.widthMm);
    setPaperHeightMm(preset.heightMm);
    setRows(0);
    setColumns(0);
    setPageIndex(0);
  };

  const updatePhotoPreset = (id: string) => {
    setPhotoSizePreset(id);
    if (id === "custom") return;
    const preset = PHOTO_SIZE_PRESETS.find((item) => item.id === id);
    if (!preset) return;
    setPhotoWidthMm(preset.widthMm);
    setPhotoHeightMm(preset.heightMm);
    setPageIndex(0);
  };

  const buildExportCanvas = () => {
    if (!layout || !pageSize.size || !layout.placements.length) {
      throw new Error("Add at least one photo and check the sheet layout before exporting.");
    }
    const canvas = exportRef.current ?? document.createElement("canvas");
    drawSheet(canvas, layout, photos, paperWidthMm, paperHeightMm, showBorders, targetDpi, showGuides);
    return canvas;
  };

  const buildPageDataUrls = () => {
    if (!layout?.pageCount || !pageSize.size) {
      throw new Error("Add at least one photo and check the sheet layout before exporting.");
    }
    if (desktopAPI && layout.pageCount > 50) {
      throw new Error("Printer and PDF export support up to 50 sheets per job. Reduce the number of copies and export again.");
    }
    return Array.from({ length: layout.pageCount }, (_, index) => {
      const pageLayout = getSheetLayout({
        paperWidthMm,
        paperHeightMm,
        photoWidthMm,
        photoHeightMm,
        marginMm,
        spacingMm,
        rows,
        columns,
        photos: photos.map(({ id, copies }) => ({ id, copies })),
        pageIndex: index,
      });
      const canvas = index === pageIndex && exportRef.current
        ? exportRef.current
        : document.createElement("canvas");
      drawSheet(canvas, pageLayout, photos, paperWidthMm, paperHeightMm, showBorders, targetDpi, showGuides);
      return canvas.toDataURL("image/png");
    });
  };

  const exportImage = (format: "png" | "jpg") => {
    try {
      const canvas = buildExportCanvas();
      saveCanvas(canvas, format === "png" ? "image/png" : "image/jpeg", `photo-sheet-${pageIndex + 1}.${format}`);
    } catch (error) {
      console.error("Unable to export photo sheet", error);
      notifyUserError(error instanceof Error ? error.message : "The photo sheet couldn't be exported.");
    }
  };

  const exportPdf = async () => {
    if (!layout?.pageCount || !pageSize.size) {
      notifyUserError("Add at least one photo and check the sheet layout before exporting.");
      return;
    }
    setBusy(true);
    try {
      if (desktopAPI) {
        await desktopAPI.exportPhotoSheetPdf({
          dataUrls: buildPageDataUrls(),
          pageWidthMm: paperWidthMm,
          pageHeightMm: paperHeightMm,
        });
      } else {
        const { jsPDF } = await import("jspdf");
        const pdf = new jsPDF({
          unit: "mm",
          format: [paperWidthMm, paperHeightMm],
          orientation: paperWidthMm > paperHeightMm ? "landscape" : "portrait",
          compress: true,
        });
        for (let index = 0; index < layout.pageCount; index++) {
          const pageLayout = getSheetLayout({
            paperWidthMm,
            paperHeightMm,
            photoWidthMm,
            photoHeightMm,
            marginMm,
            spacingMm,
            rows,
            columns,
            photos: photos.map(({ id, copies }) => ({ id, copies })),
            pageIndex: index,
          });
          const canvas = document.createElement("canvas");
          drawSheet(canvas, pageLayout, photos, paperWidthMm, paperHeightMm, showBorders, targetDpi, showGuides);
          if (index > 0) pdf.addPage([paperWidthMm, paperHeightMm], paperWidthMm > paperHeightMm ? "landscape" : "portrait");
          pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, paperWidthMm, paperHeightMm);
        }
        const blob = pdf.output("blob");
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "photo-sheet.pdf";
        link.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error("Unable to export photo sheet PDF", error);
      notifyUserError(error instanceof Error ? error.message : "The PDF couldn't be created.");
    } finally {
      setBusy(false);
    }
  };

  const printSheet = async () => {
    if (!desktopAPI) {
      notifyUserError("Direct printer access is available in the Cyber Cafe Studio desktop app.");
      return;
    }
    if (!layout?.placements.length) {
      notifyUserError("Add at least one photo before printing.");
      return;
    }
    if (!printerName) {
      notifyUserError("Select an installed printer before printing.");
      return;
    }
    setBusy(true);
    try {
      await desktopAPI.printPhotoSheet({
        dataUrls: buildPageDataUrls(),
        pageWidthMm: paperWidthMm,
        pageHeightMm: paperHeightMm,
        copies: sheetCopies,
        color: printColor,
        printerName,
      });
    } catch (error) {
      console.error("Unable to print photo sheet", error);
      notifyUserError(error instanceof Error ? error.message : "The photo sheet couldn't be printed.");
    } finally {
      setBusy(false);
    }
  };

  const setPhotoDimension = (dimension: "width" | "height", value: number) => {
    if (!Number.isFinite(value) || value <= 0 || value > 500) return;
    if (dimension === "width") {
      if (aspectLocked && value * photoHeightMm / photoWidthMm > 500) return;
      setPhotoWidthMm(value);
      if (aspectLocked) setPhotoHeightMm(value * photoHeightMm / photoWidthMm);
    } else {
      if (aspectLocked && value * photoWidthMm / photoHeightMm > 500) return;
      setPhotoHeightMm(value);
      if (aspectLocked) setPhotoWidthMm(value * photoWidthMm / photoHeightMm);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-50">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Back to document maker">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h2 className="text-sm font-bold text-slate-800">Passport photo & print maker</h2>
            <p className="text-xs text-slate-500">Prepare print-ready photo sheets on your device</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" disabled={busy} onClick={() => exportImage("jpg")} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">JPG</button>
          <button type="button" disabled={busy} onClick={() => exportImage("png")} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">PNG</button>
          <button type="button" disabled={busy} onClick={() => void exportPdf()} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            <Download className="h-3.5 w-3.5" /> PDF
          </button>
          <button type="button" disabled={busy || !desktopAPI || !printerName} onClick={() => void printSheet()} title={!printerName ? "Select an installed printer first" : "Print directly to the selected printer"} className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50">
            <Printer className="h-3.5 w-3.5" /> Print
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden min-[900px]:grid-cols-[250px_minmax(0,1fr)_230px] xl:grid-cols-[320px_minmax(0,1fr)_300px]">
        <aside className="min-h-0 overflow-y-auto border-r border-slate-200 bg-white p-4">
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Photos ({photos.length})</h3>
              <label className="flex cursor-pointer items-center gap-1 rounded-lg bg-teal-50 px-2.5 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-100">
                <ImagePlus className="h-3.5 w-3.5" /> Add photos
                <input className="hidden" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" multiple onChange={(event) => {
                  if (event.currentTarget.files) void addFiles(event.currentTarget.files);
                  event.currentTarget.value = "";
                }} />
              </label>
            </div>
            {photos.length === 0 ? (
              <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 text-center hover:border-teal-300">
                <ImagePlus className="mb-2 h-6 w-6 text-teal-600" />
                <span className="text-sm font-semibold text-slate-700">Choose photos</span>
                <span className="mt-1 text-xs text-slate-400">JPG, PNG, or WebP · processed locally</span>
                <input className="hidden" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" multiple onChange={(event) => {
                  if (event.currentTarget.files) void addFiles(event.currentTarget.files);
                  event.currentTarget.value = "";
                }} />
              </label>
            ) : (
              <div className="space-y-2">
                {photos.map((photo) => (
                  <div key={photo.id} className={`flex items-center gap-2 rounded-xl border p-2 ${photo.id === selectedId ? "border-teal-300 bg-teal-50/60" : "border-slate-200"}`}>
                    <button type="button" onClick={() => setSelectedId(photo.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                      <img src={photo.url} alt="" className="h-12 w-10 rounded-md object-cover" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-slate-700">{photo.file.name}</span>
                        <span className="text-[11px] text-slate-400">{photo.width} × {photo.height} px</span>
                      </span>
                    </button>
                    <label className="flex items-center gap-1 text-[11px] text-slate-500" title="Number of copies">
                      <input aria-label={`Copies of ${photo.file.name}`} type="number" min="0" max="500" value={photo.copies} onChange={(event) => updatePhoto(photo.id, { copies: Math.max(0, Math.min(500, Number(event.target.value) || 0)) })} className="w-12 rounded-md border border-slate-200 px-1.5 py-1 text-center text-xs" />
                    </label>
                    <button type="button" onClick={() => removePhoto(photo.id)} aria-label={`Remove ${photo.file.name}`} className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="mt-5 border-t border-slate-100 pt-4">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Photo size</h3>
            <select aria-label="Photo size preset" value={photoSizePreset} onChange={(event) => updatePhotoPreset(event.target.value)} className={mmInputClass()}>
              {PHOTO_SIZE_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
              <option value="custom">Custom size</option>
            </select>
            {photoSizePreset === "custom" && (
              <>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="text-[11px] font-medium text-slate-500">Width (mm)<input type="number" min="5" max="500" step="0.1" value={Number(photoWidthMm.toFixed(1))} onChange={(event) => setPhotoDimension("width", Number(event.target.value))} className={mmInputClass()} /></label>
                  <label className="text-[11px] font-medium text-slate-500">Height (mm)<input type="number" min="5" max="500" step="0.1" value={Number(photoHeightMm.toFixed(1))} onChange={(event) => setPhotoDimension("height", Number(event.target.value))} className={mmInputClass()} /></label>
                </div>
                <label className="mt-2 flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={aspectLocked} onChange={(event) => setAspectLocked(event.target.checked)} className="accent-teal-600" /> Lock aspect ratio</label>
              </>
            )}
          </section>

          {selectedPhoto && (
            <section className="mt-5 border-t border-slate-100 pt-4">
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Edit selected photo</h3>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => updatePhoto(selectedPhoto.id, { rotation: (selectedPhoto.rotation + 270) % 360 })} className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"><RotateCcw className="h-3.5 w-3.5" /> Rotate left</button>
                <button type="button" onClick={() => updatePhoto(selectedPhoto.id, { rotation: (selectedPhoto.rotation + 90) % 360 })} className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"><RotateCw className="h-3.5 w-3.5" /> Rotate right</button>
              </div>
            </section>
          )}
        </aside>

        <section className="flex min-h-0 flex-col overflow-hidden bg-slate-100/70 p-4">
          <div className="mb-3 flex shrink-0 items-center justify-between">
            <div><h3 className="text-sm font-bold text-slate-700">Print preview</h3><p className="text-xs text-slate-500">{paperWidthMm} × {paperHeightMm} mm · {targetDpi} DPI output</p></div>
            <div className="flex items-center gap-1">
              <button type="button" aria-label="Previous sheet" disabled={pageIndex === 0} onClick={() => setPageIndex((index) => Math.max(0, index - 1))} className="rounded-md p-1.5 text-slate-500 hover:bg-white disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
              <span className="min-w-16 text-center text-xs font-medium text-slate-600">{layout?.pageCount ? `${pageIndex + 1} / ${layout.pageCount}` : "0 sheets"}</span>
              <button type="button" aria-label="Next sheet" disabled={!layout || pageIndex + 1 >= layout.pageCount} onClick={() => setPageIndex((index) => Math.min((layout?.pageCount ?? 1) - 1, index + 1))} className="rounded-md p-1.5 text-slate-500 hover:bg-white disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-xl border border-slate-200 bg-slate-200/50 p-3">
            <canvas ref={previewRef} aria-label="Photo sheet preview" className="h-auto max-h-full max-w-full border border-slate-300 bg-white shadow-xl" />
          </div>
          {(layoutResult.error || pageSize.error || previewError) && <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{layoutResult.error || pageSize.error || previewError}</p>}
        </section>

        <aside className="min-h-0 overflow-y-auto border-l border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Sheet layout</h3>
          <label className="block text-[11px] font-medium text-slate-500">Paper size
            <select aria-label="Paper size" value={customPaper ? "custom" : PAPER_SIZE_PRESETS.find((item) => item.widthMm === paperWidthMm && item.heightMm === paperHeightMm)?.id ?? "custom"} onChange={(event) => updatePaperPreset(event.target.value)} className={`${mmInputClass()} mt-1`}>
              {PAPER_SIZE_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
              <option value="custom">Custom Size</option>
            </select>
          </label>
          {customPaper && (
            <>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <label className="text-[11px] font-medium text-slate-500">Width (mm)<input type="number" min="25" max="500" step="0.1" value={paperWidthMm} onChange={(event) => setPaperWidthMm(Number(event.target.value))} className={mmInputClass()} /></label>
                <label className="text-[11px] font-medium text-slate-500">Height (mm)<input type="number" min="25" max="500" step="0.1" value={paperHeightMm} onChange={(event) => setPaperHeightMm(Number(event.target.value))} className={mmInputClass()} /></label>
              </div>
              <button type="button" onClick={() => { setPaperWidthMm(paperHeightMm); setPaperHeightMm(paperWidthMm); }} className="mt-2 text-[11px] font-semibold text-teal-700 hover:text-teal-800">Rotate paper orientation</button>
            </>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="text-[11px] font-medium text-slate-500">Margin (mm)<input type="number" min="0" max="50" step="0.5" value={marginMm} onChange={(event) => setMarginMm(Number(event.target.value))} className={mmInputClass()} /></label>
            <label className="text-[11px] font-medium text-slate-500">Spacing (mm)<input type="number" min="0" max="20" step="0.5" value={spacingMm} onChange={(event) => setSpacingMm(Number(event.target.value))} className={mmInputClass()} /></label>
          </div>
          <div className="mt-4 rounded-xl bg-slate-50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">Grid</span>
              <button type="button" onClick={() => { setRows(0); setColumns(0); }} className="text-[11px] font-semibold text-teal-700 hover:text-teal-800">Auto fit</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] text-slate-500">Rows (0 = auto)<input aria-label="Grid rows" type="number" min="0" max="30" value={rows} onChange={(event) => setRows(Math.max(0, Math.min(30, Number(event.target.value) || 0)))} className={mmInputClass()} /></label>
              <label className="text-[11px] text-slate-500">Columns (0 = auto)<input aria-label="Grid columns" type="number" min="0" max="30" value={columns} onChange={(event) => setColumns(Math.max(0, Math.min(30, Number(event.target.value) || 0)))} className={mmInputClass()} /></label>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={showBorders} onChange={(event) => setShowBorders(event.target.checked)} className="accent-teal-600" /> Photo borders</label>
            <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={showGuides} onChange={(event) => setShowGuides(event.target.checked)} className="accent-teal-600" /><Scissors className="h-3.5 w-3.5" /> Cutting guides</label>
          </div>
          <label className="mt-4 block text-[11px] font-medium text-slate-500">Export resolution
            <select value={targetDpi} onChange={(event) => setTargetDpi(Number(event.target.value))} className={`${mmInputClass()} mt-1`}>
              <option value={300}>300 DPI · print target</option>
              <option value={150}>150 DPI · smaller files</option>
            </select>
          </label>
          <div className="mt-5 rounded-xl border border-teal-100 bg-teal-50/60 p-3">
            <p className="text-xs font-bold text-teal-900">Sheet summary</p>
            <dl className="mt-2 space-y-1.5 text-xs">
              <div className="flex justify-between"><dt className="text-slate-500">Photos per sheet</dt><dd className="font-semibold text-slate-700">{layout?.placements.length ?? 0} / {layout?.slotsPerPage ?? 0}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Total copies</dt><dd className="font-semibold text-slate-700">{layout?.totalCopies ?? 0}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Sheets required</dt><dd className="font-semibold text-slate-700">{layout?.pageCount ?? 0}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Output resolution</dt><dd className="font-semibold text-slate-700">{targetDpi} DPI</dd></div>
            </dl>
          </div>
          {desktopAPI && (
            <section className="mt-5 border-t border-slate-100 pt-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Printer settings</h3>
                <button type="button" onClick={() => {
                  void desktopAPI.getPrinters().then((availablePrinters) => {
                    setPrinters(availablePrinters);
                    setPrinterName((current) =>
                      availablePrinters.some((printer) => printer.name === current)
                        ? current
                        : (availablePrinters[0]?.name ?? ""),
                    );
                  }).catch((error: unknown) => {
                    console.error("Unable to refresh printers", error);
                    notifyUserError("Couldn't refresh the installed printer list.");
                  });
                }} className="text-[11px] font-semibold text-teal-700">Refresh</button>
              </div>
              <label className="block text-[11px] font-medium text-slate-500">Installed printer
                <select value={printerName} onChange={(event) => setPrinterName(event.target.value)} className={`${mmInputClass()} mt-1`}>
                  <option value="">{printers.length ? "Choose printer" : "No printers found"}</option>
                  {printers.map((printer) => <option key={printer.name} value={printer.name}>{printer.displayName}</option>)}
                </select>
              </label>
              <label className="mt-3 block text-[11px] font-medium text-slate-500">Copies of each sheet<input type="number" min="1" max="99" value={sheetCopies} onChange={(event) => setSheetCopies(Math.max(1, Math.min(99, Number(event.target.value) || 1)))} className={mmInputClass()} /></label>
              <label className="mt-3 flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={printColor} onChange={(event) => setPrintColor(event.target.checked)} className="accent-teal-600" /> Color printing</label>
              <p className="mt-2 text-[10px] leading-relaxed text-slate-400">Print sends the job directly to this printer without opening a dialog. Confirm its paper tray and scaling settings before printing.</p>
            </section>
          )}
          {!desktopAPI && <p className="mt-4 text-[11px] leading-relaxed text-amber-700">Open this feature in the Cyber Cafe Studio desktop app to choose an installed printer and print directly.</p>}
        </aside>
      </div>
      <canvas ref={exportRef} className="hidden" aria-hidden="true" />
    </div>
  );
}