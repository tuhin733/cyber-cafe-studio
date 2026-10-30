import { describe, expect, it } from "vitest";
import {
  detectDocument,
  estimateForegroundAngle,
  findLargestForegroundBounds,
  removeWhiteBackgroundPixels,
} from "./scanImage";

describe("detectDocument", () => {
  it("detects a skewed document on a shaded gray scanner bed", () => {
    const width = 100;
    const height = 80;
    const pixels = new Uint8ClampedArray(width * height * 4);
    const corners = [
      { x: 20, y: 15 },
      { x: 80, y: 20 },
      { x: 75, y: 60 },
      { x: 25, y: 55 },
    ];
    const isInside = (x: number, y: number) =>
      corners.every((corner, index) => {
        const next = corners[(index + 1) % corners.length];
        return (
          (next.x - corner.x) * (y - corner.y) -
            (next.y - corner.y) * (x - corner.x) >=
          0
        );
      });

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4;
        const isDocument = isInside(x, y);
        const background = 218 + Math.round((x + y) / 20);
        pixels[offset] = isDocument ? 35 : background;
        pixels[offset + 1] = isDocument ? 75 : background;
        pixels[offset + 2] = isDocument ? 120 : background;
        pixels[offset + 3] = 255;
      }
    }
    const speckOffset = (4 * width + 4) * 4;
    pixels[speckOffset] = 20;
    pixels[speckOffset + 1] = 30;
    pixels[speckOffset + 2] = 40;

    const detected = detectDocument(pixels, width, height);

    expect(detected).not.toBeNull();
    const expectNear = (actual: number, expected: number) =>
      expect(Math.abs(actual - expected)).toBeLessThanOrEqual(2);
    expectNear(detected!.corners.topLeft.x, 20);
    expectNear(detected!.corners.topLeft.y, 15);
    expectNear(detected!.corners.topRight.x, 80);
    expectNear(detected!.corners.topRight.y, 20);
    expectNear(detected!.corners.bottomRight.x, 75);
    expectNear(detected!.corners.bottomRight.y, 60);
    expectNear(detected!.corners.bottomLeft.x, 25);
    expectNear(detected!.corners.bottomLeft.y, 55);
  });

  it("detects a document that covers most of the scan area", () => {
    const width = 100;
    const height = 80;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4;
        const isDocument = x >= 3 && x < 97 && y >= 3 && y < 77;
        const color = isDocument ? 245 : 70;
        pixels[offset] = color;
        pixels[offset + 1] = color;
        pixels[offset + 2] = color;
        pixels[offset + 3] = 255;
      }
    }

    const detected = detectDocument(pixels, width, height);

    expect(detected).not.toBeNull();
    expect(detected!.corners.topLeft).toEqual({ x: 3, y: 3 });
    expect(detected!.corners.bottomRight).toEqual({ x: 96, y: 76 });
  });

  it("rejects a scan where the document cannot be distinguished from the bed", () => {
    const pixels = new Uint8ClampedArray(20 * 20 * 4);
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = 240;
      pixels[i + 1] = 240;
      pixels[i + 2] = 240;
      pixels[i + 3] = 255;
    }

    expect(detectDocument(pixels, 20, 20)).toBeNull();
  });
});

describe("estimateForegroundAngle", () => {
  it("detects document tilt without changing portrait or landscape orientation", () => {
    const width = 100;
    const height = 80;
    const pixels = new Uint8ClampedArray(width * height * 4);
    const expectedAngle = 12 * Math.PI / 180;
    const cosine = Math.cos(expectedAngle);
    const sine = Math.sin(expectedAngle);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dx = x - 50;
        const dy = y - 40;
        const localX = dx * cosine + dy * sine;
        const localY = -dx * sine + dy * cosine;
        if (Math.abs(localX) <= 25 && Math.abs(localY) <= 7) {
          pixels[(y * width + x) * 4 + 3] = 255;
        }
      }
    }

    const bounds = findLargestForegroundBounds(pixels, width, height);
    expect(bounds).not.toBeNull();
    expect(estimateForegroundAngle(pixels, width, height, bounds!))
      .toBeCloseTo(expectedAngle, 1);
  });

  it("does not rotate an upright portrait document sideways", () => {
    const width = 30;
    const height = 50;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 5; y < 45; y++) {
      for (let x = 10; x < 20; x++) {
        pixels[(y * width + x) * 4 + 3] = 255;
      }
    }

    expect(
      estimateForegroundAngle(pixels, width, height, {
        x: 10,
        y: 5,
        width: 10,
        height: 40,
      }),
    ).toBeCloseTo(0);
  });
});

describe("removeWhiteBackgroundPixels", () => {
  it("removes near-white pixels connected to the image edges", () => {
    const width = 5;
    const height = 5;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = 232;
      pixels[i + 1] = 235;
      pixels[i + 2] = 230;
      pixels[i + 3] = 255;
    }

    for (let y = 1; y <= 3; y++) {
      for (let x = 1; x <= 3; x++) {
        const offset = (y * width + x) * 4;
        pixels[offset] = 30;
        pixels[offset + 1] = 60;
        pixels[offset + 2] = 90;
      }
    }
    const enclosedWhitePixel = (2 * width + 2) * 4;
    pixels[enclosedWhitePixel] = 255;
    pixels[enclosedWhitePixel + 1] = 255;
    pixels[enclosedWhitePixel + 2] = 255;

    removeWhiteBackgroundPixels(pixels, width, height);

    expect(pixels[3]).toBe(0);
    expect(pixels[(2 * width + 1) * 4 + 3]).toBe(255);
    expect(pixels[enclosedWhitePixel + 3]).toBe(255);
  });

  describe("findLargestForegroundBounds", () => {
    it("selects the document and ignores isolated scan specks", () => {
      const width = 10;
      const height = 8;
      const pixels = new Uint8ClampedArray(width * height * 4);

      for (let y = 2; y <= 5; y++) {
        for (let x = 3; x <= 6; x++) {
          pixels[(y * width + x) * 4 + 3] = 255;
        }
      }
      pixels[(1 * width + 9) * 4 + 3] = 255;
      pixels[(6 * width + 1) * 4 + 3] = 255;

      expect(findLargestForegroundBounds(pixels, width, height)).toEqual({
        x: 3,
        y: 2,
        width: 4,
        height: 4,
      });
    });

    it("returns null when no foreground remains", () => {
      expect(
        findLargestForegroundBounds(new Uint8ClampedArray(4 * 4 * 4), 4, 4),
      ).toBeNull();
    });
  });

  it("preserves colored pixels connected to the image edges", () => {
    const pixels = new Uint8ClampedArray([
      255, 255, 255, 255,
      20, 80, 180, 255,
      255, 255, 255, 255,
    ]);

    removeWhiteBackgroundPixels(pixels, 3, 1);

    expect([...pixels.filter((_value, index) => index % 4 === 3)]).toEqual([
      0, 255, 0,
    ]);
  });

  it("rejects invalid pixel dimensions", () => {
    expect(() => removeWhiteBackgroundPixels(new Uint8ClampedArray(4), 2, 2))
      .toThrow("Invalid image dimensions or pixel data.");
  });
});
