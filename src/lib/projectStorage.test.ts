import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_LAYOUT } from "../constants";
import { loadProject, serializeProject } from "./projectStorage";

beforeEach(() => {
  localStorage.clear();
  const urlCtor = globalThis.URL;
  Object.assign(urlCtor, {
    createObjectURL: vi.fn(() => "blob:mock-url"),
    revokeObjectURL: vi.fn(),
  });
});

describe("project storage", () => {
  it("serializes and restores a saved project state", async () => {
    const file = new File(["image-payload"], "sample.png", {
      type: "image/png",
    });

    const settings = {
      ...DEFAULT_LAYOUT,
      cardW: 120,
      gap: 8,
      verticalAlign: "top" as const,
    };

    const originalDoc = {
      id: "doc-123",
      fileName: file.name,
      file,
      url: "blob:original",
      pxW: 1200,
      pxH: 800,
      category: "aadhar" as const,
      label: "Aadhar Card",
      fitToPage: true,
      widthMm: 190,
      heightMm: 277,
    };

    await serializeProject([originalDoc], settings, 2);
    const restored = await loadProject();

    expect(restored).not.toBeNull();
    expect(restored?.blankPageCount).toBe(2);
    expect(restored?.settings).toMatchObject({
      cardW: 120,
      gap: 8,
      verticalAlign: "top",
    });
    expect(restored?.docs).toHaveLength(1);
    expect(restored?.docs[0]).toMatchObject({
      fileName: "sample.png",
      pxW: 1200,
      pxH: 800,
      category: "aadhar",
      label: "Aadhar Card",
    });
    expect(restored?.docs[0].file).toBeInstanceOf(File);
    expect(restored?.docs[0].url).toBe("blob:mock-url");
  });
});
