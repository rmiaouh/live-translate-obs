import path from 'node:path';
import {
  app,
  autoUpdater,
  BrowserWindow,
  desktopCapturer,
  session,
  shell,
} from 'electron';
import { CaptionManager } from './caption-manager';
import { DiagnosticLog } from './diagnostics';
import { registerIpc, sendOverlayClientCount, sendOverlayMessage } from './ipc';
import { KeyStore } from './key-store';
import { OverlayPortError, OverlayServer } from './overlay-server';
import { SettingsStore } from './settings-store';
import { WindowsAudioService } from './windows-audio-service';

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let overlayServer: OverlayServer | null = null;
let cleanupIpc: (() => void) | null = null;
let windowsAudioService: WindowsAudioService | null = null;
let isQuitting = false;

const diagnostics = new DiagnosticLog();

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

void app.whenReady().then(async () => {
  const settingsStore = new SettingsStore(app.getPath('userData'));
  const keyStore = new KeyStore(app.getPath('userData'));
  const settings = await settingsStore.get();

  const captionManager = new CaptionManager(settings.overlay, (message) => {
    overlayServer?.broadcast(message);
    sendOverlayMessage(mainWindow, message);
  });
  overlayServer = new OverlayServer(captionManager, (count) => {
    sendOverlayClientCount(mainWindow, count);
  });

  try {
    await overlayServer.start(settings.overlayPort, settings.overlayToken);
    diagnostics.add('info', 'overlay_started', `Overlay server listening on port ${settings.overlayPort}.`);
  } catch (error) {
    const message = error instanceof OverlayPortError ? 'Overlay port is already in use.' : 'Overlay server failed.';
    diagnostics.add('error', 'overlay_start_failed', message);
  }

  mainWindow = createWindow();
  windowsAudioService = new WindowsAudioService(mainWindow, diagnostics);
  configurePermissions(mainWindow);
  cleanupIpc = registerIpc({
    window: mainWindow,
    settings: settingsStore,
    keyStore,
    captions: captionManager,
    overlay: overlayServer,
    diagnostics,
    windowsAudio: windowsAudioService,
    restartOverlay: async (port, token) => {
      const previous = await settingsStore.get();
      await overlayServer?.stop();
      try {
        await overlayServer?.start(port, token);
      } catch (error) {
        await overlayServer?.start(previous.overlayPort, previous.overlayToken);
        throw error;
      }
    },
  });

  configureUpdates();
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {
  isQuitting = true;
  cleanupIpc?.();
  cleanupIpc = null;
  windowsAudioService?.stop();
  windowsAudioService = null;
  void overlayServer?.stop();
});

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1040,
    minHeight: 700,
    backgroundColor: '#071113',
    show: false,
    autoHideMenuBar: true,
    title: 'Live Translate for OBS',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  window.once('ready-to-show', () => window.show());
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.on('closed', () => {
    mainWindow = null;
    if (!isQuitting) app.quit();
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void window.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  return window;
}

function configurePermissions(window: BrowserWindow): void {
  const currentSession = session.defaultSession;
  const allowedPermissions = new Set(['media', 'display-capture']);
  currentSession.setPermissionCheckHandler((webContents, permission) => {
    return webContents === window.webContents && allowedPermissions.has(permission);
  });
  currentSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(webContents === window.webContents && allowedPermissions.has(permission));
  });

  currentSession.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      try {
        const sources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: { width: 0, height: 0 },
          fetchWindowIcons: false,
        });
        const source = sources[0];
        if (!source) {
          callback({});
          return;
        }
        callback({ video: source, audio: 'loopback' });
      } catch {
        callback({});
      }
    },
    { useSystemPicker: process.platform === 'darwin' },
  );
}

function configureUpdates(): void {
  const updateUrl = __LIVE_TRANSLATE_UPDATE_URL__;
  if (!app.isPackaged || !updateUrl) return;
  try {
    autoUpdater.setFeedURL({ url: updateUrl });
    setTimeout(() => {
      autoUpdater.checkForUpdates();
    }, 10_000);
    autoUpdater.on('error', () => diagnostics.add('warning', 'update_failed', 'Update check failed.'));
  } catch {
    diagnostics.add('warning', 'update_config_invalid', 'Update feed configuration is invalid.');
  }
}
