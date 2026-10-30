const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require("electron");
const { autoUpdater } = require("electron-updater");
const { execFile } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { promisify } = require("node:util");

const devServerUrl = "http://127.0.0.1:5173";
let mainWindow;
const execFileAsync = promisify(execFile);

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

function sendUpdateProgress(percent) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("app:update-progress", percent);
  }
}

autoUpdater.on("download-progress", (progress) => {
  sendUpdateProgress(progress.percent);
});

autoUpdater.on("error", (error) => {
  console.error("Unable to download or install update", error);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(
      "app:update-error",
      "The update could not be installed.",
    );
  }
});

function isTrustedSender(event) {
  if (!mainWindow || event.sender !== mainWindow.webContents) return false;
  const senderUrl = event.senderFrame?.url;
  return app.isPackaged
    ? senderUrl === pathToFileURL(path.join(__dirname, "../dist/index.html")).href
    : senderUrl === devServerUrl || senderUrl?.startsWith(`${devServerUrl}/`);
}

ipcMain.handle("dialog:save-pdf", async (event, bytes, filename) => {
  if (!isTrustedSender(event)) throw new Error("Untrusted PDF save request");
  if (!(bytes instanceof Uint8Array)) throw new TypeError("PDF data must be bytes");
  if (typeof filename !== "string" || !/\.pdf$/i.test(filename)) {
    throw new TypeError("A PDF filename is required");
  }

  const safeFilename = path.basename(filename);
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: "Save PDF",
    defaultPath: safeFilename,
    filters: [{ name: "PDF files", extensions: ["pdf"] }],
  });
  if (canceled || !filePath) return { canceled: true };

  await fs.writeFile(filePath, Buffer.from(bytes));
  return { canceled: false };
});

function validatePhotoSheetOptions(options, includePrinterOptions = false) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("Invalid photo sheet options");
  }
  const { pageWidthMm, pageHeightMm } = options;
  const dataUrls = Array.isArray(options.dataUrls) ? options.dataUrls : [options.dataUrl];
  if (
    dataUrls.length < 1 ||
    dataUrls.length > 50 ||
    dataUrls.some((dataUrl) =>
      typeof dataUrl !== "string" ||
      !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUrl)
    ) ||
    dataUrls.reduce((size, dataUrl) => size + dataUrl.length, 0) > 120 * 1024 * 1024
  ) {
    throw new TypeError("The photo sheets must be valid PNG images smaller than 90 MB in total");
  }
  if (
    !Number.isFinite(pageWidthMm) ||
    !Number.isFinite(pageHeightMm) ||
    pageWidthMm < 25 ||
    pageWidthMm > 500 ||
    pageHeightMm < 25 ||
    pageHeightMm > 500
  ) {
    throw new RangeError("Paper dimensions must be between 25 mm and 500 mm");
  }
  if (includePrinterOptions) {
    if (!Number.isInteger(options.copies) || options.copies < 1 || options.copies > 99) {
      throw new RangeError("Print copies must be between 1 and 99");
    }
    if (typeof options.color !== "boolean" || typeof options.printerName !== "string") {
      throw new TypeError("Invalid printer settings");
    }
  }
  return { dataUrls, pageWidthMm, pageHeightMm };
}

function createPhotoPrintWindow(dataUrls, pageWidthMm, pageHeightMm) {
  const sheets = dataUrls.map((dataUrl) => {
    const image = dataUrl.slice("data:image/png;base64,".length);
    return `<section class="sheet"><img src="data:image/png;base64,${image}" alt="Photo print sheet"></section>`;
  }).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><style>@page{size:${pageWidthMm}mm ${pageHeightMm}mm;margin:0}html,body{margin:0;padding:0}.sheet{width:${pageWidthMm}mm;height:${pageHeightMm}mm;overflow:hidden;break-after:page;page-break-after:always}.sheet:last-child{break-after:auto;page-break-after:auto}img{display:block;width:100%;height:100%;object-fit:fill}</style></head><body>${sheets}</body></html>`;
  const printWindow = new BrowserWindow({
    show: false,
    width: 800,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  printWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  return fs.mkdtemp(path.join(os.tmpdir(), "cyber-cafe-studio-photo-print-"))
    .then(async (tempDirectory) => {
      try {
        const htmlPath = path.join(tempDirectory, "photo-sheet.html");
        await fs.writeFile(htmlPath, html, "utf8");
        await printWindow.loadFile(htmlPath);
        await printWindow.webContents.executeJavaScript(
          "Promise.all(Array.from(document.images, image => image.decode()))",
        );
        return { printWindow, tempDirectory };
      } catch (error) {
        if (!printWindow.isDestroyed()) printWindow.destroy();
        await fs.rm(tempDirectory, { recursive: true, force: true });
        throw error;
      }
    })
    .catch((error) => {
      if (!printWindow.isDestroyed()) printWindow.destroy();
      throw error;
    });
}

ipcMain.handle("printer:list", async (event) => {
  if (!isTrustedSender(event)) throw new Error("Untrusted printer list request");
  try {
    const printers = await mainWindow.webContents.getPrintersAsync();
    return printers.map(({ name, displayName }) => ({
      name,
      displayName: displayName || name,
    }));
  } catch (error) {
    console.error("Unable to list installed printers", error);
    throw new Error("Windows could not list installed printers. Check the Windows print spooler and try again.");
  }
});

ipcMain.handle("photo:print-sheet", async (event, options) => {
  if (!isTrustedSender(event)) throw new Error("Untrusted photo print request");
  const { dataUrls, pageWidthMm, pageHeightMm } = validatePhotoSheetOptions(options, true);
  const { copies, color, printerName } = options;
  if (!printerName) {
    throw new Error("Select an installed printer before printing.");
  }
  const printers = await mainWindow.webContents.getPrintersAsync();
  if (!printers.some((printer) => printer.name === printerName)) {
    throw new Error("The selected printer is no longer available. Refresh the printer list and try again.");
  }
  let printWindow;
  let tempDirectory;
  try {
    ({ printWindow, tempDirectory } = await createPhotoPrintWindow(dataUrls, pageWidthMm, pageHeightMm));
    const success = await new Promise((resolve, reject) => {
      printWindow.webContents.print(
        {
          silent: true,
          deviceName: printerName,
          copies,
          color,
          landscape: pageWidthMm > pageHeightMm,
          pageSize: {
            width: Math.round(pageWidthMm * 1000),
            height: Math.round(pageHeightMm * 1000),
          },
          marginsType: 1,
          scaleFactor: 100,
          printBackground: true,
        },
        (printed, failureReason) => {
          if (printed) resolve(true);
          else if (failureReason) reject(new Error(failureReason));
          else resolve(false);
        },
      );
    });
    if (!success) throw new Error("Printing was canceled or the printer did not accept the job.");
    return { success: true };
  } catch (error) {
    console.error("Unable to print photo sheet", error);
    const reason = error instanceof Error ? error.message : "Unknown printer error";
    throw new Error(`The photo sheet could not be printed. Check the printer, paper size, and connection. ${reason}`);
  } finally {
    if (printWindow && !printWindow.isDestroyed()) printWindow.destroy();
    if (tempDirectory) await fs.rm(tempDirectory, { recursive: true, force: true });
  }
});

ipcMain.handle("photo:export-pdf", async (event, options) => {
  if (!isTrustedSender(event)) throw new Error("Untrusted photo PDF export request");
  const { dataUrls, pageWidthMm, pageHeightMm } = validatePhotoSheetOptions(options);
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: "Export photo sheet as PDF",
    defaultPath: "photo-sheet.pdf",
    filters: [{ name: "PDF files", extensions: ["pdf"] }],
  });
  if (canceled || !filePath) return { canceled: true };

  let printWindow;
  let tempDirectory;
  try {
    ({ printWindow, tempDirectory } = await createPhotoPrintWindow(dataUrls, pageWidthMm, pageHeightMm));
    const pdf = await printWindow.webContents.printToPDF({
      pageSize: {
        width: Math.round(pageWidthMm * 1000),
        height: Math.round(pageHeightMm * 1000),
      },
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      printBackground: true,
      preferCSSPageSize: true,
      landscape: pageWidthMm > pageHeightMm,
    });
    await fs.writeFile(filePath, pdf);
    return { canceled: false };
  } catch (error) {
    console.error("Unable to export photo sheet PDF", error);
    throw new Error("The PDF could not be saved. Check the destination and available disk space.");
  } finally {
    if (printWindow && !printWindow.isDestroyed()) printWindow.destroy();
    if (tempDirectory) await fs.rm(tempDirectory, { recursive: true, force: true });
  }
});

ipcMain.handle("scanner:scan-document", async (event) => {
  if (!isTrustedSender(event)) throw new Error("Untrusted scanner request");

  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "cyber-cafe-studio-scan-"));
  const outputPath = path.join(tempDirectory, "scan.jpg");
  const scriptPath = app.isPackaged
    ? path.join(process.resourcesPath, "scanner", "scan-document.ps1")
    : path.join(__dirname, "scan-document.ps1");

  try {
    try {
      await execFileAsync(
        "powershell.exe",
        [
          "-NoProfile",
          "-STA",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          scriptPath,
          outputPath,
        ],
        {
          windowsHide: false,
          timeout: 180_000,
          encoding: "utf8",
        },
      );
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === 2) {
        return { canceled: true };
      }
      if (error && typeof error === "object" && "killed" in error && error.killed) {
        throw new Error(
          "The scanner did not respond within 3 minutes. Check that it is powered on and connected, close any other scanning apps, then try again.",
        );
      }
      const details =
        error && typeof error === "object"
          ? `${"message" in error ? error.message : ""}\n${"stderr" in error ? error.stderr : ""}`
          : "";
      if (/No WIA device of the selected type is available/i.test(details)) {
        throw new Error(
          "Windows could not find a WIA-compatible scanner. Connect and power on the scanner, install its WIA driver, and confirm it can scan in Windows Scan or Windows Fax and Scan.",
        );
      }
      throw error;
    }

    const image = await fs.readFile(outputPath);
    if (image.length === 0) throw new Error("The scanner returned an empty image");

    return {
      canceled: false,
      bytes: new Uint8Array(image),
      fileName: `scan-${new Date().toISOString().replace(/[:.]/g, "-")}.jpg`,
    };
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
});

ipcMain.handle("window:is-maximized", (event) => {
  if (!isTrustedSender(event)) throw new Error("Untrusted window state request");
  return mainWindow.isMaximized();
});

ipcMain.handle("window:minimize", (event) => {
  if (!isTrustedSender(event)) throw new Error("Untrusted minimize request");
  mainWindow.minimize();
});

ipcMain.handle("window:toggle-maximize", (event) => {
  if (!isTrustedSender(event)) throw new Error("Untrusted maximize request");
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});

ipcMain.handle("window:close", (event) => {
  if (!isTrustedSender(event)) throw new Error("Untrusted close request");
  mainWindow.close();
});

ipcMain.handle("app:check-updates", async (event) => {
  if (!isTrustedSender(event)) throw new Error("Untrusted update check request");

  const response = await fetch(
    "https://api.github.com/repos/tuhin733/cyber-cafe-studio/releases/latest",
    {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "Cyber Cafe Studio",
      },
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!response.ok) {
    throw new Error(`GitHub release check failed (${response.status})`);
  }

  const release = await response.json();
  if (
    typeof release.tag_name !== "string" ||
    !/^v?\d+\.\d+\.\d+$/.test(release.tag_name) ||
    typeof release.published_at !== "string" ||
    Number.isNaN(Date.parse(release.published_at))
  ) {
    throw new Error("The latest GitHub release has invalid metadata");
  }

  const installer = Array.isArray(release.assets)
    ? release.assets.find(
        (asset) =>
          typeof asset.name === "string" &&
          /\.exe$/i.test(asset.name) &&
          typeof asset.browser_download_url === "string" &&
          asset.browser_download_url.startsWith(
            `https://github.com/tuhin733/cyber-cafe-studio/releases/download/${release.tag_name}/`,
          ),
      )
    : undefined;

  return {
    tag: release.tag_name,
    publishedAt: release.published_at,
    ...(installer ? { installerUrl: installer.browser_download_url } : {}),
  };
});

ipcMain.handle("app:open-installer-download", (event, downloadUrl) => {
  if (!isTrustedSender(event)) {
    throw new Error("Untrusted installer download request");
  }
  if (typeof downloadUrl !== "string") {
    throw new TypeError("Invalid installer download URL");
  }

  const parsedUrl = new URL(downloadUrl);
  if (
    parsedUrl.protocol !== "https:" ||
    parsedUrl.hostname !== "github.com" ||
    !parsedUrl.pathname.startsWith("/tuhin733/cyber-cafe-studio/releases/download/") ||
    !parsedUrl.pathname.toLowerCase().endsWith(".exe")
  ) {
    throw new TypeError("Invalid installer download URL");
  }

  return shell.openExternal(parsedUrl.href);
});

ipcMain.handle("app:download-update", async (event, tag) => {
  if (!isTrustedSender(event)) throw new Error("Untrusted update download request");
  if (!app.isPackaged) {
    throw new Error("In-app updates are only available in an installed build");
  }
  if (typeof tag !== "string" || !/^v?\d+\.\d+\.\d+$/.test(tag)) {
    throw new TypeError("Invalid update version");
  }

  const result = await autoUpdater.checkForUpdates();
  if (
    !result ||
    result.updateInfo.version !== tag.replace(/^v/, "")
  ) {
    throw new Error("The available release changed. Restart the app to check again.");
  }

  sendUpdateProgress(0);
  await autoUpdater.downloadUpdate();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("app:update-installing");
  }
  setTimeout(() => autoUpdater.quitAndInstall(false, true), 0);
  return { installing: true };
});

ipcMain.handle("app:open-repository", (event) => {
  if (!isTrustedSender(event)) throw new Error("Untrusted repository open request");
  return shell.openExternal("https://github.com/tuhin733/cyber-cafe-studio");
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 900,
    minHeight: 640,
    frame: false,
    icon: path.join(__dirname, "../build/icon.ico"),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const notifyMaximizeState = () => {
    mainWindow.webContents.send("window:maximize-state", mainWindow.isMaximized());
  };
  mainWindow.on("maximize", notifyMaximizeState);
  mainWindow.on("unmaximize", notifyMaximizeState);

  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const allowedUrl = app.isPackaged
      ? pathToFileURL(path.join(__dirname, "../dist/index.html")).href
      : devServerUrl;
    if (url !== allowedUrl) event.preventDefault();
  });

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  } else {
    mainWindow.loadURL(devServerUrl);
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    await fs.rm(path.join(app.getPath("userData"), "removebg-api-key.bin"), {
      force: true,
    });
  } catch (error) {
    console.error("Unable to remove the obsolete remove.bg API key", error);
  }

  if (process.platform !== "win32") {
    dialog.showErrorBox(
      "Unsupported platform",
      "Cyber Cafe Studio is only supported on Windows.",
    );
    app.quit();
    return;
  }

  Menu.setApplicationMenu(null);
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
