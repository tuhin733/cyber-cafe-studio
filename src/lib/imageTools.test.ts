import { describe, expect, it } from "vitest";
import {
  getAspectDimension,
  getCropBounds,
  MAX_IMAGE_PIXELS,
  validateOutputDimensions,
} from "./imageTools";

describe("getAspectDimension", () => {
  it("calculates the matching dimension while keeping the source aspect ratio", () => {
    expect(getAspectDimension(1600, 900, "width", 800)).toBe(450);
    expect(getAspectDimension(1600, 900, "height", 450)).toBe(800);
  });

  it("rejects invalid source and requested dimensions", () => {
    expect(() => getAspectDimension(0, 900, "width", 800)).toThrow(/positive whole numbers/);
    expect(() => getAspectDimension(1600, 900, "width", 0)).toThrow(/positive whole numbers/);
  });
});

describe("validateOutputDimensions", () => {
  it("accepts valid dimensions under the canvas pixel limit", () => {
    expect(validateOutputDimensions(1920, 1080)).toEqual({ width: 1920, height: 1080 });
  });

  it("rejects dimensions that exceed supported bounds or pixel count", () => {
    expect(() => validateOutputDimensions(20_001, 1)).toThrow(/between 1 and/);
    expect(() =>
      validateOutputDimensions(
        20_000,
        Math.floor(MAX_IMAGE_PIXELS / 20_000) + 1,
      ),
    ).toThrow(/pixel limit/);
    expect(() => validateOutputDimensions(100.5, 100)).toThrow(/between 1 and/);
  });
});

describe("getCropBounds", () => {
  it("converts a normalized selection into source pixel bounds", () => {
    expect(
      getCropBounds({ x: 0.1, y: 0.2, width: 0.5, height: 0.4 }, 1000, 500),
    ).toEqual({ x: 100, y: 100, width: 500, height: 200 });
  });

  it("clamps selections to image edges and rejects empty selections", () => {
    expect(
      getCropBounds({ x: 0.8, y: 0.75, width: 0.5, height: 0.5 }, 100, 100),
    ).toEqual({ x: 80, y: 75, width: 20, height: 25 });
    expect(() => getCropBounds({ x: 0, y: 0, width: 0, height: 0 }, 100, 100)).toThrow(/Select an area/);
  });
});
