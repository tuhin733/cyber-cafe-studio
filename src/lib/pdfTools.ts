import { savePDF } from "./pdf";

export type PdfCompressionPreset = "balanced" | "small" | "smallest";

const COMPRESSION_SETTINGS: Record<
  PdfCompressionPreset,
  { dpi: number; quality: number }
> = {
  balanced: { dpi: 150, quality: 0.78 },
  small: { dpi: 110, quality: 0.68 },
  smallest: { dpi: 80, quality: 0.56 },
};

const MAX_PDF_PAGES = 200;
const MAX_PAGE_PIXELS = 16_000_000;
const MAX_PAGE_DIMENSION_POINTS = 14_400;

export interface PdfProgress {
  completed: number;
  total: number;
}

export async function mergePdfFiles(files: File[]): Promise<Blob> {
  if (files.length < 2) throw new Error("Choose at least two PDF files to merge.");

  const { PDFDocument } = await import("pdf-lib");
  const mergedPdf = await PDFDocument.create();
  for (const file of files) {
    const source = await PDFDocument.load(await file.arrayBuffer());
    if (mergedPdf.getPageCount() + source.getPageCount() > MAX_PDF_PAGES) {
      throw new Error(`The merged PDF exceeds the ${MAX_PDF_PAGES}-page limit.`);
    }
    const pages = await mergedPdf.copyPages(source, source.getPageIndices());
    pages.forEach((page) => mergedPdf.addPage(page));
  }

  const bytes = await mergedPdf.save({ useObjectStreams: true });
  return new Blob([bytes], { type: "application/pdf" });
}

export async function compressPdfFile(
  file: File,
  preset: PdfCompressionPreset,
  onProgress?: (progress: PdfProgress) => void,
): Promise<Blob> {
  const [{ getDocument, GlobalWorkerOptions }, workerUrl, { jsPDF }] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
    import("jspdf"),
  ]);
  GlobalWorkerOptions.workerSrc = workerUrl.default;

  const settings = COMPRESSION_SETTINGS[preset];
  if (!settings) throw new Error("Choose a valid compression level.");
  const sourceBytes = new Uint8Array(await file.arrayBuffer());
  const loadingTask = getDocument({ data: sourceBytes });
  let document: Awaited<typeof loadingTask.promise> | undefined;

  try {
    document = await loadingTask.promise;
    if (document.numPages > MAX_PDF_PAGES) {
      throw new Error(`This PDF exceeds the ${MAX_PDF_PAGES}-page limit.`);
    }

    let output: InstanceType<typeof jsPDF> | undefined;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      if (
        !Number.isFinite(baseViewport.width) ||
        !Number.isFinite(baseViewport.height) ||
        baseViewport.width <= 0 ||
        baseViewport.height <= 0 ||
        baseViewport.width > MAX_PAGE_DIMENSION_POINTS ||
        baseViewport.height > MAX_PAGE_DIMENSION_POINTS
      ) {
        page.cleanup();
        throw new Error(`Page ${pageNumber} has unsupported dimensions.`);
      }

      const scale = settings.dpi / 72;
      const viewport = page.getViewport({ scale });
      const pixelCount = viewport.width * viewport.height;
      if (
        !Number.isSafeInteger(Math.ceil(viewport.width) * Math.ceil(viewport.height)) ||
        pixelCount > MAX_PAGE_PIXELS
      ) {
        page.cleanup();
        throw new Error(
          `Page ${pageNumber} is too large to compress at this setting. Try a smaller compression level.`,
        );
      }

      const canvas = window.document.createElement("canvas");
      canvas.width = Math.max(1, Math.ceil(viewport.width));
      canvas.height = Math.max(1, Math.ceil(viewport.height));
      try {
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("Canvas processing is unavailable.");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: context, viewport }).promise;
        const image = canvas.toDataURL("image/jpeg", settings.quality);
        const pageWidth = baseViewport.width;
        const pageHeight = baseViewport.height;

        if (!output) {
          output = new jsPDF({
            unit: "pt",
            format: [pageWidth, pageHeight],
            orientation: pageWidth > pageHeight ? "landscape" : "portrait",
            compress: true,
          });
        } else {
          output.addPage([pageWidth, pageHeight], pageWidth > pageHeight ? "landscape" : "portrait");
        }
        output.addImage(image, "JPEG", 0, 0, pageWidth, pageHeight);
      } finally {
        canvas.width = 0;
        canvas.height = 0;
        page.cleanup();
      }
      onProgress?.({ completed: pageNumber, total: document.numPages });
    }

    if (!output) throw new Error("The selected PDF contains no pages.");
    return output.output("blob");
  } finally {
    await document?.destroy();
    if (!document) await loadingTask.destroy();
  }
}

export async function savePdfToolResult(blob: Blob, fileName: string) {
  return savePDF(blob, fileName);
}
