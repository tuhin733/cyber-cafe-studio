import {
  pipeline,
  type BackgroundRemovalPipeline,
  type ProgressInfo,
} from "@huggingface/transformers";

export const MODNET_MODEL_ID = "Xenova/modnet";
export const MODNET_MODEL_REVISION =
  "fa2fa546052fba4c08921230a26cc69a333fca12";

let modelPromise: Promise<BackgroundRemovalPipeline> | null = null;

export async function removePortraitBackground(
  image: HTMLImageElement,
  onProgress?: (info: ProgressInfo) => void,
): Promise<{ blob: Blob; width: number; height: number }> {
  if (!modelPromise) {
    modelPromise = pipeline("background-removal", MODNET_MODEL_ID, {
      revision: MODNET_MODEL_REVISION,
      dtype: "fp32",
      progress_callback: onProgress,
    }).catch((error: unknown) => {
      modelPromise = null;
      throw error;
    });
  }

  const model = await modelPromise;
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image processing is unavailable.");
  context.drawImage(image, 0, 0);

  const result = await model(canvas);
  if (result.channels !== 4) {
    throw new Error("The portrait model returned an invalid transparency mask.");
  }

  const blob = await result.toBlob("image/png");
  if (!(blob instanceof Blob) || blob.size === 0 || blob.type !== "image/png") {
    throw new Error("The portrait cutout could not be exported as a PNG.");
  }

  return { blob, width: result.width, height: result.height };
}
