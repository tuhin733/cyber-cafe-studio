declare const __APP_VERSION__: string;

interface Window {
  desktopAPI?: {
    savePdf(
      bytes: Uint8Array,
      filename: string,
    ): Promise<{ canceled: boolean }>;
    getPrinters(): Promise<Array<{ name: string; displayName: string }>>;
    printPhotoSheet(options: {
      dataUrls: string[];
      pageWidthMm: number;
      pageHeightMm: number;
      copies: number;
      color: boolean;
      printerName: string;
    }): Promise<{ success: boolean }>;
    exportPhotoSheetPdf(options: {
      dataUrls: string[];
      pageWidthMm: number;
      pageHeightMm: number;
    }): Promise<{ canceled: boolean }>;
    scanDocument(): Promise<
      | { canceled: true }
      | { canceled: false; bytes: Uint8Array; fileName: string }
    >;
    isMaximized(): Promise<boolean>;
    minimize(): Promise<void>;
    toggleMaximize(): Promise<void>;
    close(): Promise<void>;
    checkUpdates(): Promise<{
      tag: string;
      publishedAt: string;
      installerUrl?: string;
    }>;
    downloadUpdate(tag: string): Promise<{ installing: boolean }>;
    openInstallerDownload(url: string): Promise<void>;
    openRepository(): Promise<void>;
    onUpdateProgress(callback: (percent: number) => void): () => void;
    onUpdateInstalling(callback: () => void): () => void;
    onUpdateError(callback: (message: string) => void): () => void;
    onMaximizeChange(callback: (isMaximized: boolean) => void): () => void;
  };
}
