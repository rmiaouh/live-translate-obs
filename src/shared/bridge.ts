import type {
  AppMetadata,
  AppSettings,
  CaptionDeltaInput,
  CaptionSource,
  CreateClientSecretInput,
  DiagnosticsSnapshot,
  KeyStatus,
  KeyValidationResult,
  OverlayConfig,
  OverlayMessage,
  PermissionState,
  RealtimeClientSecret,
  SessionStateUpdate,
  SettingsPatch,
  WindowsAudioApplication,
  WindowsAudioCapability,
  WindowsAudioCaptureStatus,
  WindowsAudioStartInput,
  WindowsAudioStartResult,
} from './contracts';

export interface LiveTranslateBridge {
  settings: {
    get(): Promise<AppSettings>;
    update(patch: SettingsPatch): Promise<AppSettings>;
  };
  key: {
    status(): Promise<KeyStatus>;
    setAndValidate(apiKey: string): Promise<KeyValidationResult>;
    validateStored(): Promise<KeyValidationResult>;
    delete(): Promise<KeyStatus>;
  };
  realtime: {
    createClientSecret(input: CreateClientSecretInput): Promise<RealtimeClientSecret>;
    sendCaptionDelta(input: CaptionDeltaInput): Promise<void>;
    clearCaption(source?: CaptionSource): Promise<void>;
    updateSessionState(update: SessionStateUpdate): void;
  };
  overlay: {
    updateConfig(config: OverlayConfig): Promise<OverlayConfig>;
    onMessage(listener: (message: OverlayMessage) => void): () => void;
    onClientCount(listener: (count: number) => void): () => void;
  };
  windowsAudio: {
    capability(): Promise<WindowsAudioCapability>;
    listApplications(): Promise<WindowsAudioApplication[]>;
    start(input: WindowsAudioStartInput): Promise<WindowsAudioStartResult>;
    stop(captureId?: string): Promise<void>;
    onStatus(listener: (status: WindowsAudioCaptureStatus) => void): () => void;
  };
  clipboard: {
    writeText(text: string): Promise<boolean>;
  };
  app: {
    metadata(): Promise<AppMetadata>;
    permissions(): Promise<PermissionState>;
    requestMicrophonePermission(): Promise<boolean>;
    openMicrophoneSettings(): Promise<void>;
    diagnostics(): Promise<DiagnosticsSnapshot>;
    exportDiagnostics(): Promise<string | null>;
  };
}
