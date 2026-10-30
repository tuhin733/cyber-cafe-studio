import { describe, expect, it } from "vitest";
import {
  estimatePrintDpi,
  getSheetLayout,
  PAPER_SIZE_PRESETS,
} from "./passportPhotos";

describe("getSheetLayout", () => {
  it("calculates an automatic A4 grid with exact millimetre positions", () => {
    const layout = getSheetLayout({
      paperWidthMm: 210,
      paperHeightMm: 297,
      photoWidthMm: 35,
      photoHeightMm: 45,
      marginMm: 5,
      spacingMm: 3,
      rows: 0,
      columns: 0,
      photos: [{ id: "photo", copies: 20 }],
      pageIndex: 0,
    });

    expect(layout.columns).toBe(5);
    expect(layout.rows).toBe(6);
    expect(layout.placements).toHaveLength(20);
    expect(layout.placements[0]).toMatchObject({ xMm: 5, yMm: 5, widthMm: 35, heightMm: 45 });
    expect(layout.placements[1].xMm).toBe(43);
  });

  it("paginates copies and keeps different photos in requested order", () => {
    const layout = getSheetLayout({
      paperWidthMm: 101.6,
      paperHeightMm: 152.4,
      photoWidthMm: 35,
      photoHeightMm: 45,
      marginMm: 5,
      spacingMm: 2,
      rows: 2,
      columns: 2,
      photos: [{ id: "first", copies: 3 }, { id: "second", copies: 2 }],
      pageIndex: 1,
    });

    expect(layout.pageCount).toBe(2);
    expect(layout.placements.map((placement) => placement.photoId)).toEqual([
      "second",
    ]);
  });

  it("rejects a photo size that cannot fit on the paper", () => {
    expect(() => getSheetLayout({
      paperWidthMm: 30,
      paperHeightMm: 30,
      photoWidthMm: 35,
      photoHeightMm: 45,
      marginMm: 0,
      spacingMm: 0,
      rows: 0,
      columns: 0,
      photos: [{ id: "photo", copies: 1 }],
      pageIndex: 0,
    })).toThrow(/does not fit/);
  });

  it("rejects manually configured grids that would clip outside the paper", () => {
    expect(() => getSheetLayout({
      paperWidthMm: 101.6,
      paperHeightMm: 152.4,
      photoWidthMm: 35,
      photoHeightMm: 45,
      marginMm: 5,
      spacingMm: 2,
      rows: 4,
      columns: 4,
      photos: [{ id: "photo", copies: 1 }],
      pageIndex: 0,
    })).toThrow(/exceeds the paper/);
  });

  it("does not allow invalid copy counts or measurements", () => {
    expect(() => getSheetLayout({
      paperWidthMm: PAPER_SIZE_PRESETS[0].widthMm,
      paperHeightMm: PAPER_SIZE_PRESETS[0].heightMm,
      photoWidthMm: 35,
      photoHeightMm: 45,
      marginMm: 5,
      spacingMm: 2,
      rows: 0,
      columns: 0,
      photos: [{ id: "photo", copies: -1 }],
      pageIndex: 0,
    })).toThrow(/copies/);
  });
});

describe("paper size presets", () => {
  it("includes the requested standard paper sizes in millimetres", () => {
    expect(PAPER_SIZE_PRESETS).toEqual([
      { id: "a4", label: "A4 (Standard Document)", widthMm: 210, heightMm: 297 },
      { id: "4x6", label: "4 × 6 in (Photo Print)", widthMm: 101.6, heightMm: 152.4 },
      { id: "legal", label: "Legal (Long Paper)", widthMm: 215.9, heightMm: 355.6 },
      { id: "a5", label: "A5 (Half A4)", widthMm: 148, heightMm: 210 },
      { id: "a3", label: "A3 (Large Paper)", widthMm: 297, heightMm: 420 },
    ]);
  });
});

describe("estimatePrintDpi", () => {
  it("reports the limiting pixel dimension", () => {
    expect(estimatePrintDpi(413, 531, 35, 45)).toBe(299);
  });

  it("returns zero for invalid image dimensions", () => {
    expect(estimatePrintDpi(0, 100, 35, 45)).toBe(0);
  });
});