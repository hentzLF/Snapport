import {
  app,
  BrowserWindow,
  desktopCapturer,
  globalShortcut,
  ipcMain,
  screen,
  nativeImage,
  Tray,
  Menu,
} from "electron";
import { autoUpdater } from "electron-updater";
import path from "path";
import https from "https";
import http from "http";
import { URL } from "url";
import { isDiscordWebhook, sendDiscordWebhook } from "./webhooks/discord";

let overlayWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let updateState: "none" | "available" | "downloaded" = "none";

function createOverlayWindow(): void {
  const { width, height } = screen.getPrimaryDisplay().bounds;

  overlayWindow = new BrowserWindow({
    x: 0,
    y: 0,
    width,
    height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    focusable: true,
    fullscreen: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "../preload/preload.js"),
    },
  });

  overlayWindow.loadFile(
    path.join(__dirname, "../../../src/renderer/index.html")
  );

  overlayWindow.setAlwaysOnTop(true, "screen-saver");
  overlayWindow.setVisibleOnAllWorkspaces(true);

  overlayWindow.on("closed", () => {
    overlayWindow = null;
  });
}

async function showOverlay(): Promise<void> {
  if (overlayWindow) {
    overlayWindow.focus();
    return;
  }

  // Capture the full screen BEFORE showing the overlay
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.size;
  const scale = primaryDisplay.scaleFactor;
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: Math.round(width * scale), height: Math.round(height * scale) },
  });
  const screenshotDataUrl = sources[0]?.thumbnail.toDataURL() ?? null;

  createOverlayWindow();

  // Send the screenshot (and any pending update state) to the renderer once it's ready
  overlayWindow!.webContents.once("did-finish-load", () => {
    overlayWindow?.webContents.send("screenshot:ready", screenshotDataUrl);
    if (updateState === "available") overlayWindow?.webContents.send("update:available");
    if (updateState === "downloaded") overlayWindow?.webContents.send("update:downloaded");
  });
}

function hideOverlay(): void {
  if (overlayWindow) {
    overlayWindow.close();
    overlayWindow = null;
  }
}

function sendToWebhook(
  webhookUrl: string,
  payload: object
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(webhookUrl);
    const body = JSON.stringify(payload);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        "User-Agent": "Snapport/0.1.0",
      },
    };

    const transport = parsed.protocol === "https:" ? https : http;
    const req = transport.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () =>
        resolve({ status: res.statusCode ?? 0, body: data })
      );
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function setupTray(): void {
  const iconFile = process.platform === "win32" ? "icon.ico"
    : process.platform === "darwin" ? "icon.icns"
    : "icon.png";
  const iconPath = path.join(__dirname, "../../../assets", iconFile);
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon);
  const menu = Menu.buildFromTemplate([
    {
      label: "Open Snapport (Ctrl+Shift+F)",
      click: showOverlay,
    },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() },
  ]);
  tray.setToolTip("Snapport — Capture. Annotate. Report.");
  tray.setContextMenu(menu);
}

app.whenReady().then(() => {
  setupTray();

  globalShortcut.register("CommandOrControl+Shift+F", showOverlay);

  // IPC: renderer asks to close the overlay
  ipcMain.on("overlay:close", hideOverlay);

  // IPC: renderer requests update install
  ipcMain.on("update:install", () => autoUpdater.quitAndInstall());

  // Auto-updater (only runs in packaged builds)
  if (app.isPackaged) {
    autoUpdater.checkForUpdates();

    autoUpdater.on("update-available", () => {
      updateState = "available";
      overlayWindow?.webContents.send("update:available");
    });

    autoUpdater.on("update-downloaded", () => {
      updateState = "downloaded";
      overlayWindow?.webContents.send("update:downloaded");
    });
  }

  // IPC: renderer sends report payload to webhook
  ipcMain.handle(
    "report:send",
    async (
      _event,
      { webhookUrl, comment, imageDataUrl }: { webhookUrl: string; comment: string; imageDataUrl: string }
    ) => {
      try {
        let result: { status: number; body: string };

        if (isDiscordWebhook(webhookUrl)) {
          // Convert data URL to Buffer for Discord file upload
          const base64Data = imageDataUrl.replace(/^data:image\/png;base64,/, "");
          const screenshotBuffer = Buffer.from(base64Data, "base64");

          result = await sendDiscordWebhook(webhookUrl, {
            comment,
            screenshotBuffer,
            platform: process.platform,
            timestamp: new Date().toISOString(),
          });
        } else {
          result = await sendToWebhook(webhookUrl, {
            source: "snapport",
            comment,
            screenshot: imageDataUrl,
            timestamp: new Date().toISOString(),
            platform: process.platform,
          });
        }

        return { ok: result.status >= 200 && result.status < 300, status: result.status };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    }
  );
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

// Keep app running in background (tray app — no window = no quit)
app.on("window-all-closed", (e: Event) => {
  e.preventDefault();
});
