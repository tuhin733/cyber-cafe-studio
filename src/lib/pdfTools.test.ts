import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { mergePdfFiles } from "./pdfTools";

async function createPdf(width: number, height: number, name: string) {
  const document = await PDFDocument.create();
  document.addPage([width, height]);
  const bytes = await document.save();
  return new File([bytes], name, { type: "application/pdf" });
}

describe("PDF tools", () => {
  it("merges files in the requested order and preserves page sizes", async () => {
    const first = await createPdf(300, 400, "first.pdf");
    const second = await createPdf(500, 600, "second.pdf");
    const merged = await mergePdfFiles([first, second]);
    const result = await PDFDocument.load(await merged.arrayBuffer());

    expect(merged.type).toBe("application/pdf");
    expect(result.getPageCount()).toBe(2);
    expect(result.getPage(0).getWidth()).toBe(300);
    expect(result.getPage(1).getWidth()).toBe(500);
  });

  it("requires at least two source PDFs to merge", async () => {
    const file = await createPdf(300, 400, "only.pdf");
    await expect(mergePdfFiles([file])).rejects.toThrow(
      "Choose at least two PDF files to merge.",
    );
  });
});
