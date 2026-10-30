import { DEFAULT_LAYOUT } from "../constants";
import { notifyUserError } from "./userErrors";
import type { LayoutSettings, UploadedDoc } from "../types";

const STORAGE_KEY = "docstitch-project-v1";

type PersistedProject = {
  settings: LayoutSettings;
  blankPageCount?: number;
  docs: Array<
    Omit<UploadedDoc, "file" | "url"> & {
      fileDataUrl?: string;
    }
  >;
};

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });

const createFileFromDataUrl = async (
  fileName: string,
  fileDataUrl: string,
  type?: string,
) => {
  if (!fileDataUrl) {
    throw new Error("Missing file data.");
  }

  const response = await fetch(fileDataUrl);
  const blob = await response.blob();
  return new File([blob], fileName, {
    type: type ?? (blob.type || "application/octet-stream"),
  });
};

export const serializeProject = async (
  docs: UploadedDoc[],
  settings: LayoutSettings,
  blankPageCount = 0,
): Promise<void> => {
  const serializedDocs = await Promise.all(
    docs.map(async (doc) => {
      const payloadDoc = {
        ...doc,
        fileDataUrl: doc.file ? await readFileAsDataUrl(doc.file) : undefined,
      };

      delete (payloadDoc as { file?: File }).file;
      delete (payloadDoc as { url?: string }).url;
      return payloadDoc;
    }),
  );

  const payload: PersistedProject = {
    settings,
    blankPageCount,
    docs: serializedDocs,
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
};

export const loadProject = async (): Promise<{
  docs: UploadedDoc[];
  settings: LayoutSettings;
  blankPageCount: number;
} | null> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as PersistedProject;
    if (!parsed || !Array.isArray(parsed.docs)) return null;

    const docs = await Promise.all(
      parsed.docs.map(async (doc) => {
        const file = await createFileFromDataUrl(
          doc.fileName,
          doc.fileDataUrl ?? "",
          undefined,
        );
        const restoredDoc = { ...doc };
        delete (restoredDoc as { fileDataUrl?: string }).fileDataUrl;

        return {
          ...restoredDoc,
          file,
          url: URL.createObjectURL(file),
        } satisfies UploadedDoc;
      }),
    );

    return {
      docs,
      settings: parsed.settings ?? DEFAULT_LAYOUT,
      blankPageCount: Math.max(
        0,
        Math.floor(parsed.blankPageCount ?? 0),
      ),
    };
  } catch (error) {
    console.error("Unable to restore saved project state:", error);
    notifyUserError(
      "The saved project couldn't be restored. You can continue with a new project.",
    );
    return null;
  }
};

export const clearProject = () => {
  localStorage.removeItem(STORAGE_KEY);
};
