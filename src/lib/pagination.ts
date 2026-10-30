import type { LayoutSettings, UploadedDoc } from "../types";
import { A4 } from "../types";

export interface PlacedDoc {
  doc: UploadedDoc;
  /** position in mm from top-left of the sheet */
  x: number;
  y: number;
  /** width in mm */
  w: number;
  /** height in mm */
  h: number;
}

export interface PageLayout {
  pages: PlacedDoc[][];
}

/**
 * Given a flat list of documents and layout settings, compute the
 * position of every card across multiple A4 sheets.
 *
 * Strategy:
 * - If cols > 0 use explicit grid.
 * - Otherwise auto-fit as many cards per row as possible, then wrap
 *   rows, then wrap pages.
 * - Card width comes from settings; height is scaled to the image's
 *   pixel aspect ratio so faces are never squashed.
 */
export function paginate(
  docs: UploadedDoc[],
  s: LayoutSettings,
  blankPageCount = 0,
): PageLayout {
  if (docs.length === 0) {
    return { pages: Array.from({ length: Math.max(0, Math.floor(blankPageCount)) }, () => []) };
  }

  const usableW = A4.w - s.margin * 2;
  const usableH = A4.h - s.margin * 2;

  const cols =
    s.cols > 0
      ? s.cols
      : Math.max(1, Math.floor((usableW + s.gap) / (s.cardW + s.gap)));
  const cardW = Math.min(
    s.cardW,
    (usableW - (cols - 1) * s.gap) / cols,
  );

  const pages: PlacedDoc[][][] = [];
  let page: PlacedDoc[][] = [];
  let row: PlacedDoc[] = [];
  let rowH = 0;
  let curY = s.margin;
  let colCount = 0;

  const flushRow = () => {
    if (row.length === 0) return;

    const rowWidth = row.reduce((max, placed) => Math.max(max, placed.x + placed.w), 0) - Math.min(...row.map((placed) => placed.x));
    const leftOffset = s.margin + (usableW - rowWidth) / 2 - Math.min(...row.map((placed) => placed.x));
    for (const placed of row) {
      placed.x += leftOffset;
    }

    page.push(row);
    curY += rowH + s.gap;
    row = [];
    rowH = 0;
    colCount = 0;
  };

  const flushPage = () => {
    flushRow();
    if (page.length === 0) return;

    const flatPage = page.flat();
    if (flatPage.length > 0) {
      const top = Math.min(...flatPage.map((placed) => placed.y));
      const bottom = Math.max(...flatPage.map((placed) => placed.y + placed.h));
      const contentH = Math.max(0, bottom - top);
      const offset =
        s.verticalAlign === "center"
          ? s.margin + (usableH - contentH) / 2 - top
          : s.margin - top;
      for (const placed of flatPage) {
        placed.y += offset;
      }
    }

    pages.push(page);
    page = [];
    curY = s.margin;
  };

  for (const doc of docs) {
    const pageBreakCount = Math.max(0, Math.floor(doc.pageBreakBefore ?? 0));
    if (pageBreakCount > 0) {
      flushPage();
      for (let index = 1; index < pageBreakCount; index++) {
        pages.push([]);
      }
    }

    if (doc.category === "document") {
      flushPage();
      const fitScale = Math.min(usableW / doc.pxW, usableH / doc.pxH);
      const w = doc.fitToPage
        ? doc.pxW * fitScale
        : Math.min(usableW, Math.max(1, doc.widthMm));
      const h = doc.fitToPage
        ? doc.pxH * fitScale
        : Math.min(usableH, Math.max(1, doc.heightMm));
      pages.push([
        [
          {
            doc,
            x: s.margin + (usableW - w) / 2,
            y:
              s.verticalAlign === "center"
                ? s.margin + (usableH - h) / 2
                : s.margin,
            w,
            h,
          },
        ],
      ]);
      continue;
    }

    const aspect = doc.pxW / doc.pxH;
    const w = Math.min(cardW, usableH * aspect);
    const h = w / aspect;
    const slotH = h;

    if (colCount >= cols) {
      flushRow();
    }

    if (colCount === 0 && curY + slotH > s.margin + usableH + 0.01) {
      flushPage();
    }

    const x =
      cols === 1
        ? s.margin + (usableW - w) / 2
        : s.margin + (usableW - (cols * cardW + (cols - 1) * s.gap)) / 2 + colCount * (cardW + s.gap);
    const y = curY;

    row.push({ doc, x, y, w, h });
    rowH = Math.max(rowH, slotH);
    colCount++;

    if (colCount >= cols) {
      flushRow();
    }
  }

  flushPage();

  const flat: PlacedDoc[][] = pages.map((p) =>
    p.flat().map((placed) => {
      const { placement } = placed.doc;
      return placement ? { ...placed, ...placement } : placed;
    }),
  );
  return {
    pages: [
      ...flat,
      ...Array.from(
        { length: Math.max(0, Math.floor(blankPageCount)) },
        () => [],
      ),
    ],
  };
}
