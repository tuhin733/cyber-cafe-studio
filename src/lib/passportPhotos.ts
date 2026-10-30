export interface PhotoSize {
  id: string;
  label: string;
  widthMm: number;
  heightMm: number;
  note?: string;
}

export interface PaperSize {
  id: string;
  label: string;
  widthMm: number;
  heightMm: number;
}

export interface PhotoCopies {
  id: string;
  copies: number;
}

export interface SheetPlacement {
  photoId: string;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
}

export interface SheetLayoutOptions {
  paperWidthMm: number;
  paperHeightMm: number;
  photoWidthMm: number;
  photoHeightMm: number;
  marginMm: number;
  spacingMm: number;
  rows: number;
  columns: number;
  photos: PhotoCopies[];
  pageIndex: number;
}

export interface SheetLayout {
  rows: number;
  columns: number;
  slotsPerPage: number;
  totalCopies: number;
  pageCount: number;
  placements: SheetPlacement[];
}

export const PHOTO_SIZE_PRESETS: PhotoSize[] = [
  { id: "35x45", label: "35 × 45 mm", widthMm: 35, heightMm: 45, note: "Common passport format; check the receiving service's requirements." },
  { id: "2x2", label: "2 × 2 in", widthMm: 50.8, heightMm: 50.8, note: "50.8 × 50.8 mm square photo." },
  { id: "25x35", label: "25 × 35 mm", widthMm: 25, heightMm: 35, note: "Check the receiving service's requirements." },
  { id: "25x30", label: "25 × 30 mm stamp", widthMm: 25, heightMm: 30, note: "Stamp-size preset; check the receiving service's requirements." },
];

export const PAPER_SIZE_PRESETS: PaperSize[] = [
  { id: "a4", label: "A4 (Standard Document)", widthMm: 210, heightMm: 297 },
  { id: "4x6", label: "4 × 6 in (Photo Print)", widthMm: 101.6, heightMm: 152.4 },
  { id: "legal", label: "Legal (Long Paper)", widthMm: 215.9, heightMm: 355.6 },
  { id: "a5", label: "A5 (Half A4)", widthMm: 148, heightMm: 210 },
  { id: "a3", label: "A3 (Large Paper)", widthMm: 297, heightMm: 420 },
];

export function getSheetLayout(options: SheetLayoutOptions): SheetLayout {
  const {
    paperWidthMm,
    paperHeightMm,
    photoWidthMm,
    photoHeightMm,
    marginMm,
    spacingMm,
  } = options;
  const measurements = [
    paperWidthMm,
    paperHeightMm,
    photoWidthMm,
    photoHeightMm,
    marginMm,
    spacingMm,
  ];
  if (
    measurements.some((value) => !Number.isFinite(value)) ||
    paperWidthMm <= 0 ||
    paperHeightMm <= 0 ||
    photoWidthMm <= 0 ||
    photoHeightMm <= 0 ||
    marginMm < 0 ||
    spacingMm < 0
  ) {
    throw new RangeError("Paper, photo, margin, and spacing values must be valid positive measurements.");
  }

  const rows = Number.isInteger(options.rows) && options.rows > 0
    ? options.rows
    : Math.floor((paperHeightMm - marginMm * 2 + spacingMm) / (photoHeightMm + spacingMm));
  const columns = Number.isInteger(options.columns) && options.columns > 0
    ? options.columns
    : Math.floor((paperWidthMm - marginMm * 2 + spacingMm) / (photoWidthMm + spacingMm));
  if (rows < 1 || columns < 1) {
    throw new RangeError("The selected photo does not fit on this paper with the current margins.");
  }
  if (
    marginMm * 2 + columns * photoWidthMm + (columns - 1) * spacingMm > paperWidthMm + 0.001 ||
    marginMm * 2 + rows * photoHeightMm + (rows - 1) * spacingMm > paperHeightMm + 0.001
  ) {
    throw new RangeError("The selected grid exceeds the paper size. Reduce the rows, columns, or spacing.");
  }

  const totalCopies = options.photos.reduce((total, photo) => {
    if (!Number.isInteger(photo.copies) || photo.copies < 0) {
      throw new RangeError("Photo copies must be a non-negative whole number.");
    }
    return total + photo.copies;
  }, 0);
  const slotsPerPage = rows * columns;
  const pageCount = Math.ceil(totalCopies / slotsPerPage);
  const firstSlot = options.pageIndex * slotsPerPage;
  const lastSlot = Math.min(totalCopies, firstSlot + slotsPerPage);
  const requestedIds: string[] = [];
  for (const photo of options.photos) {
    for (let copy = 0; copy < photo.copies; copy++) requestedIds.push(photo.id);
  }

  const placements: SheetPlacement[] = [];
  for (let slot = firstSlot; slot < lastSlot; slot++) {
    const row = Math.floor((slot - firstSlot) / columns);
    const column = (slot - firstSlot) % columns;
    placements.push({
      photoId: requestedIds[slot],
      xMm: marginMm + column * (photoWidthMm + spacingMm),
      yMm: marginMm + row * (photoHeightMm + spacingMm),
      widthMm: photoWidthMm,
      heightMm: photoHeightMm,
    });
  }

  return { rows, columns, slotsPerPage, totalCopies, pageCount, placements };
}

export function estimatePrintDpi(
  pixelWidth: number,
  pixelHeight: number,
  widthMm: number,
  heightMm: number,
): number {
  if (
    !Number.isFinite(pixelWidth) ||
    !Number.isFinite(pixelHeight) ||
    !Number.isFinite(widthMm) ||
    !Number.isFinite(heightMm) ||
    pixelWidth <= 0 ||
    pixelHeight <= 0 ||
    widthMm <= 0 ||
    heightMm <= 0
  ) {
    return 0;
  }
  return Math.floor(Math.min(pixelWidth * 25.4 / widthMm, pixelHeight * 25.4 / heightMm));
}