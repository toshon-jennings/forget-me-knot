import { app, Tray, Menu, BrowserWindow, nativeImage, shell, ipcMain } from "electron";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { load, save, addService, updateService } from "./store.js";
import { resolveFavicon } from "./favicon.js";
import type { Service } from "./types.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

let tray: Tray | null = null;
let win: BrowserWindow | null = null;

const WIDTH = 380;
const HEIGHT = 520;
const TRAY_ICON_SIZE = 16;
const TRAY_GUID = "6CCEBC87-D00B-46BD-B081-FB4025EDEF9B";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function createWindow() {
  win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, "preload.js"),
    },
  });

  win.loadFile(join(__dirname, "gui/index.html"));

  win.on("blur", () => {
    win?.hide();
  });
}

function toggleWindow() {
  if (!win) return;
  if (win.isVisible()) {
    win.hide();
    return;
  }

  const trayBounds = tray!.getBounds();
  const winBounds = win.getBounds();

  const x = Math.round(trayBounds.x + trayBounds.width / 2 - winBounds.width / 2);
  const y = Math.round(trayBounds.y + trayBounds.height + 4);

  win.setPosition(x, y);
  win.show();
  win.focus();
}

function setupIpc() {
  ipcMain.handle("get-data", () => load());

  ipcMain.handle("add-service", async (_e, data: { url: string; name?: string; category?: string; notes?: string }) => {
    const id = randomUUID();
    const parsed = new URL(data.url);
    const name = data.name || parsed.hostname.replace(/^www\./, "");
    const { favicon } = await resolveFavicon(data.url, id);

    const service: Service = {
      id,
      name,
      url: data.url,
      favicon,
      category: data.category || null,
      notes: data.notes || null,
      addedAt: today(),
      lastUsedAt: today(),
      status: "active",
    };
    save(addService(load(), service));
    return load();
  });

  ipcMain.handle("open-service", (_e, id: string) => {
    const tb = load();
    const match = tb.services.find((s) => s.id === id);
    if (match) {
      shell.openExternal(match.url);
      save(updateService(tb, id, { lastUsedAt: today() }));
    }
    return load();
  });

  ipcMain.handle("remove-service", (_e, id: string) => {
    save(updateService(load(), id, { status: "archived" }));
    return load();
  });

  ipcMain.handle("edit-service", (_e, id: string, data: { url: string; name?: string; category?: string; notes?: string }) => {
    const parsed = new URL(data.url);
    save(updateService(load(), id, {
      url: data.url,
      name: data.name || parsed.hostname.replace(/^www\./, ""),
      category: data.category || null,
      notes: data.notes || null,
    }));
    return load();
  });
}

function createTray() {
  const iconPath = join(__dirname, "../assets/trayTemplate.png");
  const sourceImage = nativeImage.createFromPath(iconPath);

  if (sourceImage.isEmpty()) {
    throw new Error(`Unable to load tray icon: ${iconPath}`);
  }

  const img = sourceImage.resize({
    width: TRAY_ICON_SIZE,
    height: TRAY_ICON_SIZE,
    quality: "best",
  });
  img.setTemplateImage(true);

  tray = process.platform === "darwin"
    ? new Tray(img, TRAY_GUID)
    : new Tray(img);
  tray.setToolTip("ToolBox");

  const contextMenu = Menu.buildFromTemplate([
    { label: "Open ToolBox", click: toggleWindow },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() },
  ]);
  tray.on("click", toggleWindow);

  if (process.platform === "darwin") {
    tray.on("right-click", () => tray?.popUpContextMenu(contextMenu));
  } else {
    tray.setContextMenu(contextMenu);
  }
}

app.whenReady().then(() => {
  app.setActivationPolicy("accessory");

  if (app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: true });
  }

  setupIpc();
  createTray();
  createWindow();
});

app.on("window-all-closed", () => {});
