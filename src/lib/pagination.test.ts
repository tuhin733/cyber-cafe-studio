import { describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT } from "../constants";
import { paginate } from "./pagination";
import type { UploadedDoc } from "../types";

const createDoc = (
  id: string,
  pageBreakBefore?: number,
): UploadedDoc => ({
  id,
  fileName: `${id}.png`,
  file: new File([], `${id}.png`),
  url: `blob:${id}`,
  pxW: 100,
  pxH: 100,
  category: "aadhar",
  label: id,
  fitToPage: true,
  widthMm: 190,
  heightMm: 277,
  pageBreakBefore,
});

describe("pagination", () => {
  it("appends requested blank pages after the document pages", () => {
    const result = paginate([], DEFAULT_LAYOUT, 2);

    expect(result.pages).toEqual([[], []]);
  });

  it("ignores negative blank page counts", () => {
    const result = paginate([], DEFAULT_LAYOUT, -1);

    expect(result.pages).toEqual([]);
  });

  it("preserves blank pages inserted before a document", () => {
    const result = paginate(
      [createDoc("first"), createDoc("last", 2)],
      DEFAULT_LAYOUT,
    );

    expect(result.pages.map((page) => page.map(({ doc }) => doc.id))).toEqual([
      ["first"],
      [],
      ["last"],
    ]);
  });
});
