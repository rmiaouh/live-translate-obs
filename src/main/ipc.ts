import { writeFile } from 'node:fs/promises';
import { app, BrowserWindow, clipboard, dialog, ipcMain, shell, systemPreferences } from 'electron';
import { z } from 'zod';
import {
  CaptionDeltaInputSchema,
  CaptionSourceSchema,
  CreateClientSecretInputSchema,
  IPC,
  OverlayConfigSchema,
  SessionStateUpdateSchema,
  SettingsPatchSchema,
  WindowsAudioStartInputSchema,
  type DiagnosticsSnapshot,
  type KeyValidationResult,
  type PermissionState,
} from '../shared/contracts';
import type { CaptionManager } from './caption-manager';
import type { DiagnosticLog } from './diagnostics';
import type { KeyStore } from './key-store';
import { createTranslationClientSecret, OpenAIRequestError } from './openai-realtime';
import type { OverlayServer } from './overlay-server';
import type { SettingsStore } from './settings-store';
import type { WindowsAudioService } from './windows-audio-service';

interface IpcDependencies {
  window: BrowserWindow;
  settings: SettingsStore;
  keyStore: KeyStore;
  captions: CaptionManager;
  overlay: OverlayServer;
  diagnostics: DiagnosticLog;
  windowsAudio: WindowsAudioService;
  restartOverlay(port: number, token: string): Promise<void>;
}

const ApiKeySchema = z.string().trim().min(20).max(512).refine((value) => !/\s/.test(value));
const ClipboardTextSchema = z.string().min(1).max(8192);

export function registerIpc(deps: IpcDependencies): () => void {
  const channels: string[] = [];
  const handle = (channel: string, listener: Parameters<typeof ipcMain.handle>[1]) => {
    ipcMain.handle(channel, async (event, ...args) => {
      if (event.sender !== deps.window.webContents) throw new Error('unauthorized_ipc_sender');
      return listener(event, ...args);
    });
    channels.push(channel);
  };

  handle(IPC.settingsGet, () => deps.settings.get());
  handle(IPC.settingsUpdate, async (_event, rawPatch) => {
    const patch = SettingsPatchSchema.parse(rawPatch);
    const current = await deps.settings.get();
    if (patch.overlayPort && patch.overlayPort !== current.overlayPort) {
      await deps.restartOverlay(patch.overlayPort, current.overlayToken);
    }
    const next = await deps.settings.update(patch);
    if (patch.overlay) deps.captions.updateConfig(next.overlay);
    return next;
  });

  handle(IPC.keyStatus, () => deps.keyStore.status());
  handle(IPC.keySetAndValidate, async (_event, rawKey): Promise<KeyValidationResult> => {
    const apiKey = ApiKeySchema.parse(rawKey);
    try {
      const settings = await deps.settings.get();
      await createTranslationClientSecret(apiKey, settings.targetLanguage, settings.installationId);
      await deps.keyStore.set(apiKey);
      deps.diagnostics.add('info', 'key_validated', 'OpenAI key validated and stored securely.');
      return { ok: true, ...(await deps.keyStore.status()) };
    } catch (error) {
      const errorCode = mapOpenAIError(error);
      deps.diagnostics.add('warning', 'key_validation_failed', `Key validation failed: ${errorCode}`);
      return { ok: false, ...(await deps.keyStore.status()), errorCode };
    }
  });
  handle(IPC.keyValidateStored, async (): Promise<KeyValidationResult> => {
    try {
      const [apiKey, settings] = await Promise.all([deps.keyStore.get(), deps.settings.get()]);
      await createTranslationClientSecret(apiKey, settings.targetLanguage, settings.installationId);
      return { ok: true, ...(await deps.keyStore.status()) };
    } catch (error) {
      return {
        ok: false,
        ...(await deps.keyStore.status()),
        errorCode: mapOpenAIError(error),
      };
    }
  });
  handle(IPC.keyDelete, async () => {
    await deps.keyStore.delete();
    deps.diagnostics.add('info', 'key_deleted', 'Stored OpenAI key deleted.');
    return deps.keyStore.status();
  });

  handle(IPC.realtimeCreateSecret, async (_event, rawInput) => {
    const input = CreateClientSecretInputSchema.parse(rawInput);
    const [apiKey, settings] = await Promise.all([deps.keyStore.get(), deps.settings.get()]);
    try {
      return await createTranslationClientSecret(
        apiKey,
        input.targetLanguage,
        settings.installationId,
      );
    } catch (error) {
      const code = mapOpenAIError(error);
      deps.diagnostics.add('error', 'client_secret_failed', `Realtime client secret failed: ${code}`);
      throw new Error(code, { cause: error });
    }
  });
  handle(IPC.captionDelta, (_event, rawInput) => {
    deps.captions.append(CaptionDeltaInputSchema.parse(rawInput));
  });
  handle(IPC.captionClear, (_event, rawSource) => {
    const source = rawSource == null ? undefined : CaptionSourceSchema.parse(rawSource);
    deps.captions.clear(source);
  });
  handle(IPC.overlayConfigUpdate, async (_event, rawConfig) => {
    const config = OverlayConfigSchema.parse(rawConfig);
    const next = await deps.settings.update({ overlay: config });
    deps.captions.updateConfig(next.overlay);
    return next.overlay;
  });

  handle(IPC.metadataGet, async () => {
    return {
      name: app.getName(),
      version: app.getVersion(),
      platform: process.platform,
      overlayUrl: deps.overlay.overlayUrl(),
      overlayClients: deps.overlay.clientCount(),
    };
  });
  handle(IPC.permissionsGet, () => permissionState());
  handle(IPC.permissionsRequestMicrophone, async () => {
    if (process.platform !== 'darwin') return true;
    return systemPreferences.askForMediaAccess('microphone');
  });
  handle(IPC.permissionsOpenMicrophoneSettings, async () => {
    if (process.platform === 'darwin') {
      await shell.openExternal(
        'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
      );
    } else if (process.platform === 'win32') {
      await shell.openExternal('ms-settings:privacy-microphone');
    }
  });
  handle(IPC.diagnosticsGet, async (): Promise<DiagnosticsSnapshot> => {
    const [settings, key, permissions] = await Promise.all([
      deps.settings.get(),
      deps.keyStore.status(),
      permissionState(),
    ]);
    return {
      entries: deps.diagnostics.snapshot(),
      overlayClients: deps.overlay.clientCount(),
      overlayPort: settings.overlayPort,
      hasKey: key.hasKey,
      permissions,
    };
  });
  handle(IPC.diagnosticsExport, async () => {
    const settings = await deps.settings.get();
    const result = await dialog.showSaveDialog(deps.window, {
      title: 'Exporter le diagnostic',
      defaultPath: `live-translate-diagnostic-${new Date().toISOString().slice(0, 10)}.txt`,
      filters: [{ name: 'Text', extensions: ['txt'] }],
    });
    if (result.canceled || !result.filePath) return null;
    const report = deps.diagnostics.toText({
      app: app.getName(),
      version: app.getVersion(),
      platform: process.platform,
      overlayPort: settings.overlayPort,
      overlayClients: deps.overlay.clientCount(),
    });
    await writeFile(result.filePath, report, 'utf8');
    return result.filePath;
  });
  handle(IPC.clipboardWriteText, (_event, rawText) => {
    const text = ClipboardTextSchema.parse(rawText);
    clipboard.writeText(text);
    return clipboard.readText() === text;
  });
  handle(IPC.windowsAudioCapability, () => deps.windowsAudio.capability());
  handle(IPC.windowsAudioList, () => deps.windowsAudio.listApplications());
  handle(IPC.windowsAudioStart, (_event, rawInput) => {
    return deps.windowsAudio.start(WindowsAudioStartInputSchema.parse(rawInput));
  });
  handle(IPC.windowsAudioStop, (_event, rawCaptureId) => {
    const captureId = rawCaptureId == null ? undefined : z.string().uuid().parse(rawCaptureId);
    deps.windowsAudio.stop(captureId);
  });

  const sessionListener = (event: Electron.IpcMainEvent, rawUpdate: unknown) => {
    if (event.sender !== deps.window.webContents) return;
    const update = SessionStateUpdateSchema.parse(rawUpdate);
    if (update.status === 'failed') {
      deps.diagnostics.add(
        'error',
        'realtime_session_failed',
        `Realtime ${update.source} session failed: ${update.errorCode ?? 'unknown'}`,
      );
    }
  };
  ipcMain.on(IPC.sessionState, sessionListener);

  return () => {
    for (const channel of channels) ipcMain.removeHandler(channel);
    ipcMain.off(IPC.sessionState, sessionListener);
  };
}

export function sendOverlayMessage(window: BrowserWindow | null, message: unknown): void {
  if (window && !window.isDestroyed()) window.webContents.send(IPC.overlayMessage, message);
}

export function sendOverlayClientCount(window: BrowserWindow | null, count: number): void {
  if (window && !window.isDestroyed()) window.webContents.send(IPC.overlayClients, count);
}

function mapOpenAIError(error: unknown): KeyValidationResult['errorCode'] {
  if (error instanceof OpenAIRequestError) return error.code;
  if (error instanceof Error && error.message === 'missing_api_key') return 'invalid_key';
  return 'unknown';
}

async function permissionState(): Promise<PermissionState> {
  if (process.platform !== 'darwin') {
    return { microphone: 'unknown', screen: 'unknown' };
  }
  return {
    microphone: normalizePermission(systemPreferences.getMediaAccessStatus('microphone')),
    screen: normalizePermission(systemPreferences.getMediaAccessStatus('screen')),
  };
}

function normalizePermission(value: string): PermissionState['microphone'] {
  if (value === 'not-determined' || value === 'granted' || value === 'denied' || value === 'restricted') {
    return value;
  }
  return 'unknown';
}
