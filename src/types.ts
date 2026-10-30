export type DocCategoryId =
  | "aadhar"
  | "voter"
  | "pan"
  | "passport"
  | "driving"
  | "ration"
  | "document"
  | "custom";

export interface DocCategory {
  id: DocCategoryId;
  label: string;
  /** Display width of a single side in millimetres (short edge) */
  cardW: number;
  /** Display height of a single side in millimetres (long edge) */
  cardH: number;
  accent: string;
  /** Icon name from lucide-react */
  icon: string;
}

export interface UploadedDoc {
  id: string;
  fileName: string;
  /** original file used for re-encoding into the PDF */
  file: File;
  /** object-URL for <img> preview – revoked on remove */
  url: string;
  /** decoded pixel width */
  pxW: number;
  /** decoded pixel height */
  pxH: number;
  category: DocCategoryId;
  /** user-facing label, editable */
  label: string;
  /** document images can fill the printable page or use a custom size */
  fitToPage: boolean;
  widthMm: number;
  heightMm: number;
  /** Number of page breaks before this document, used for manual page operations. */
  pageBreakBefore?: number;
  /** Optional manual position and size on the A4 print sheet. */
  placement?: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
}

export interface LayoutSettings {
  /** margin inside the A4 sheet in mm */
  margin: number;
  /** gap between cards in mm */
  gap: number;
  /** target card width in mm (height auto-scales to aspect) */
  cardW: number;
  /** vertical placement of content on each page */
  verticalAlign: "top" | "center";
  /** 0 = auto-fill rows then columns, >0 = explicit grid */
  cols: number;
  rows: number;
}

export type UpdateStatus =
  | { state: "checking" }
  | {
      state: "available";
      tag: string;
      publishedAt: string;
      installerUrl?: string;
    }
  | { state: "current"; tag: string; publishedAt: string }
  | { state: "error" };

/** A4 portrait in mm */
export const A4 = { w: 210, h: 297 } as const;
