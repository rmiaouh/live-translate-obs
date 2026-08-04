import { contextBridge, ipcRenderer } from 'electron';
import type { LiveTranslateBridge } from '../shared/bridge';
import { IPC } from '../shared/contracts';

const bridge: LiveTranslateBridge = {
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    update: (patch) => ipcRenderer.invoke(IPC.settingsUpdate, patch),
  },
  key: {
    status: () => ipcRenderer.invoke(IPC.keyStatus),
    setAndValidate: (apiKey) => ipcRenderer.invoke(IPC.keySetAndValidate, apiKey),
    validateStored: () => ipcRenderer.invoke(IPC.keyValidateStored),
    delete: () => ipcRenderer.invoke(IPC.keyDelete),
  },
  realtime: {
    createClientSecret: (input) => ipcRenderer.invoke(IPC.realtimeCreateSecret, input),
    sendCaptionDelta: (input) => ipcRenderer.invoke(IPC.captionDelta, input),
    clearCaption: (source) => ipcRenderer.invoke(IPC.captionClear, source),
    updateSessionState: (update) => ipcRenderer.send(IPC.sessionState, update),
  },
  overlay: {
    updateConfig: (config) => ipcRenderer.invoke(IPC.overlayConfigUpdate, config),
    onMessage: (listener) => {
      const wrapped = (_event: Electron.IpcRendererEvent, message: Parameters<typeof listener>[0]) =>
        listener(message);
      ipcRenderer.on(IPC.overlayMessage, wrapped);
      return () => ipcRenderer.off(IPC.overlayMessage, wrapped);
    },
    onClientCount: (listener) => {
      const wrapped = (_event: Electron.IpcRendererEvent, count: number) => listener(count);
      ipcRenderer.on(IPC.overlayClients, wrapped);
      return () => ipcRenderer.off(IPC.overlayClients, wrapped);
    },
  },
  windowsAudio: {
    capability: () => ipcRenderer.invoke(IPC.windowsAudioCapability),
    listApplications: () => ipcRenderer.invoke(IPC.windowsAudioList),
    start: (input) => ipcRenderer.invoke(IPC.windowsAudioStart, input),
    stop: (captureId) => ipcRenderer.invoke(IPC.windowsAudioStop, captureId),
    onStatus: (listener) => {
      const wrapped = (_event: Electron.IpcRendererEvent, status: Parameters<typeof listener>[0]) =>
        listener(status);
      ipcRenderer.on(IPC.windowsAudioStatus, wrapped);
      return () => ipcRenderer.off(IPC.windowsAudioStatus, wrapped);
    },
  },
  clipboard: {
    writeText: (text) => ipcRenderer.invoke(IPC.clipboardWriteText, text),
  },
  app: {
    metadata: () => ipcRenderer.invoke(IPC.metadataGet),
    permissions: () => ipcRenderer.invoke(IPC.permissionsGet),
    requestMicrophonePermission: () => ipcRenderer.invoke(IPC.permissionsRequestMicrophone),
    openMicrophoneSettings: () => ipcRenderer.invoke(IPC.permissionsOpenMicrophoneSettings),
    diagnostics: () => ipcRenderer.invoke(IPC.diagnosticsGet),
    exportDiagnostics: () => ipcRenderer.invoke(IPC.diagnosticsExport),
  },
};

ipcRenderer.on(IPC.windowsAudioPort, (event, metadata) => {
  window.postMessage(
    { type: 'live-translate-windows-audio-port', metadata },
    '*',
    event.ports,
  );
});

contextBridge.exposeInMainWorld('liveTranslate', bridge);
