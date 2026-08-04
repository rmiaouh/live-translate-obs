import { z } from 'zod';

export const APP_NAME = 'Live Translate for OBS';
export const DEFAULT_OVERLAY_PORT = 17654;
export const MODEL_ID = 'gpt-realtime-translate';
export const PRICE_PER_SESSION_MINUTE_USD = 0.034;
export const PRICE_EFFECTIVE_DATE = '2026-08-04';

export const TARGET_LANGUAGES = [
  { code: 'en', label: { fr: 'Anglais', en: 'English' } },
  { code: 'fr', label: { fr: 'Français', en: 'French' } },
  { code: 'es', label: { fr: 'Espagnol', en: 'Spanish' } },
  { code: 'pt', label: { fr: 'Portugais', en: 'Portuguese' } },
  { code: 'de', label: { fr: 'Allemand', en: 'German' } },
  { code: 'it', label: { fr: 'Italien', en: 'Italian' } },
  { code: 'zh', label: { fr: 'Chinois', en: 'Chinese' } },
  { code: 'ja', label: { fr: 'Japonais', en: 'Japanese' } },
  { code: 'ko', label: { fr: 'Coréen', en: 'Korean' } },
  { code: 'ru', label: { fr: 'Russe', en: 'Russian' } },
  { code: 'hi', label: { fr: 'Hindi', en: 'Hindi' } },
  { code: 'id', label: { fr: 'Indonésien', en: 'Indonesian' } },
  { code: 'vi', label: { fr: 'Vietnamien', en: 'Vietnamese' } },
] as const;

const languageCodes = TARGET_LANGUAGES.map(({ code }) => code) as [
  (typeof TARGET_LANGUAGES)[number]['code'],
  ...(typeof TARGET_LANGUAGES)[number]['code'][],
];

export const LocaleSchema = z.enum(['fr', 'en']);
export const TargetLanguageSchema = z.enum(languageCodes);
export const CaptureModeSchema = z.enum(['mixed', 'split']);
export const CaptionSourceSchema = z.enum(['mixed', 'host', 'guest']);
export const GuestSourceSchema = z.enum(['application', 'system', 'input']);
export const ReadingModeSchema = z.enum(['pages', 'rollup']);
export const DensityPresetSchema = z.enum(['large', 'balanced', 'moreText', 'custom']);
export const SessionStatusSchema = z.enum([
  'idle',
  'starting',
  'live',
  'reconnecting',
  'stopping',
  'failed',
]);

export const CaptureProfileSchema = z.object({
  mode: CaptureModeSchema.default('mixed'),
  microphoneDeviceId: z.string().nullable().default(null),
  microphoneEnabled: z.boolean().default(true),
  guestSource: GuestSourceSchema.default('system'),
  guestDeviceId: z.string().nullable().default(null),
  guestsEnabled: z.boolean().default(true),
  guestApplicationId: z.string().trim().min(1).max(260).nullable().default(null),
  guestApplicationName: z.string().trim().min(1).max(120).nullable().default(null),
  hostLabel: z.string().trim().min(1).max(32).default('Hôte'),
  guestLabel: z.string().trim().min(1).max(32).default('Invités'),
});

export const OverlayConfigSchema = z.object({
  theme: z.enum(['signal', 'subtitle', 'minimal']).default('signal'),
  readingMode: ReadingModeSchema.default('pages'),
  densityPreset: DensityPresetSchema.default('balanced'),
  fontSizePx: z.number().int().min(32).max(96).default(60),
  textColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#F2F7F4'),
  hostAccentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#66D9EF'),
  guestAccentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#FFB545'),
  backgroundOpacity: z.number().min(0).max(1).default(0.76),
  position: z.enum(['top', 'center', 'bottom']).default('bottom'),
  maxWidthPercent: z.number().int().min(40).max(94).default(82),
  maxLines: z.union([z.literal(2), z.literal(3)]).default(2),
  displayDurationMs: z.number().int().min(2000).max(12000).default(6000),
  showLabels: z.boolean().default(true),
});

export const OVERLAY_PRESETS = {
  large: { fontSizePx: 72, maxWidthPercent: 74, maxLines: 2 },
  balanced: { fontSizePx: 60, maxWidthPercent: 82, maxLines: 2 },
  moreText: { fontSizePx: 46, maxWidthPercent: 90, maxLines: 3 },
  custom: { fontSizePx: 60, maxWidthPercent: 82, maxLines: 2 },
} as const satisfies Record<z.infer<typeof DensityPresetSchema>, {
  fontSizePx: number;
  maxWidthPercent: number;
  maxLines: 2 | 3;
}>;

export const AppSettingsSchema = z.object({
  version: z.literal(2).default(2),
  locale: LocaleSchema.default('fr'),
  onboardingStep: z.number().int().min(0).max(5).default(0),
  onboardingComplete: z.boolean().default(false),
  installationId: z.string().uuid(),
  overlayPort: z.number().int().min(1024).max(65535).default(DEFAULT_OVERLAY_PORT),
  overlayToken: z.string().min(32),
  targetLanguage: TargetLanguageSchema.default('fr'),
  captureProfile: CaptureProfileSchema.default({
    mode: 'mixed',
    microphoneDeviceId: null,
    microphoneEnabled: true,
    guestSource: 'system',
    guestDeviceId: null,
    guestsEnabled: true,
    guestApplicationId: null,
    guestApplicationName: null,
    hostLabel: 'Hôte',
    guestLabel: 'Invités',
  }),
  overlay: OverlayConfigSchema.default({
    theme: 'signal',
    readingMode: 'pages',
    densityPreset: 'balanced',
    fontSizePx: 60,
    textColor: '#F2F7F4',
    hostAccentColor: '#66D9EF',
    guestAccentColor: '#FFB545',
    backgroundOpacity: 0.76,
    position: 'bottom',
    maxWidthPercent: 82,
    maxLines: 2,
    displayDurationMs: 6000,
    showLabels: true,
  }),
});

export const CaptionStateSchema = z.object({
  source: CaptionSourceSchema,
  label: z.string().trim().min(1).max(32).optional(),
  utteranceId: z.string().uuid(),
  revision: z.number().int().positive(),
  isFinal: z.boolean(),
  text: z.string().max(4096),
  sequence: z.number().int().nonnegative(),
  receivedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(),
  visible: z.boolean(),
});

export const OverlayMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('overlay.snapshot'),
    captions: z.array(CaptionStateSchema),
    config: OverlayConfigSchema,
  }),
  z.object({ type: z.literal('caption.delta'), caption: CaptionStateSchema }),
  z.object({ type: z.literal('caption.clear'), source: CaptionSourceSchema }),
  z.object({ type: z.literal('overlay.config'), config: OverlayConfigSchema }),
]);

export const SettingsPatchSchema = z
  .object({
    locale: LocaleSchema.optional(),
    onboardingStep: z.number().int().min(0).max(5).optional(),
    onboardingComplete: z.boolean().optional(),
    overlayPort: z.number().int().min(1024).max(65535).optional(),
    targetLanguage: TargetLanguageSchema.optional(),
    captureProfile: CaptureProfileSchema.optional(),
    overlay: OverlayConfigSchema.optional(),
  })
  .strict();

export const CaptionDeltaInputSchema = z.object({
  source: CaptionSourceSchema,
  label: z.string().trim().min(1).max(32).optional(),
  delta: z.string().min(1).max(2048),
});

export const CreateClientSecretInputSchema = z.object({
  targetLanguage: TargetLanguageSchema,
  source: CaptionSourceSchema,
});

export type Locale = z.infer<typeof LocaleSchema>;
export type TargetLanguage = z.infer<typeof TargetLanguageSchema>;
export type CaptureMode = z.infer<typeof CaptureModeSchema>;
export type CaptionSource = z.infer<typeof CaptionSourceSchema>;
export type GuestSource = z.infer<typeof GuestSourceSchema>;
export type ReadingMode = z.infer<typeof ReadingModeSchema>;
export type DensityPreset = z.infer<typeof DensityPresetSchema>;
export type SessionStatus = z.infer<typeof SessionStatusSchema>;
export type CaptureProfile = z.infer<typeof CaptureProfileSchema>;
export type OverlayConfig = z.infer<typeof OverlayConfigSchema>;
export type AppSettings = z.infer<typeof AppSettingsSchema>;
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>;
export type CaptionState = z.infer<typeof CaptionStateSchema>;
export type OverlayMessage = z.infer<typeof OverlayMessageSchema>;
export type CaptionDeltaInput = z.infer<typeof CaptionDeltaInputSchema>;
export type CreateClientSecretInput = z.infer<typeof CreateClientSecretInputSchema>;
export type WindowsAudioApplication = z.infer<typeof WindowsAudioApplicationSchema>;
export type WindowsAudioCapability = z.infer<typeof WindowsAudioCapabilitySchema>;
export type WindowsAudioCaptureStatus = z.infer<typeof WindowsAudioCaptureStatusSchema>;
export type WindowsAudioStartInput = z.infer<typeof WindowsAudioStartInputSchema>;

export interface WindowsAudioStartResult {
  captureId: string;
  sampleRate: 48_000;
  channels: 1;
}

export interface KeyStatus {
  hasKey: boolean;
  encryptionAvailable: boolean;
}

export interface KeyValidationResult extends KeyStatus {
  ok: boolean;
  errorCode?: 'invalid_key' | 'billing_required' | 'rate_limited' | 'model_unavailable' | 'network' | 'unknown';
}

export interface RealtimeClientSecret {
  value: string;
  expiresAt?: number;
}

export interface AppMetadata {
  name: string;
  version: string;
  platform: NodeJS.Platform;
  overlayUrl: string;
  overlayClients: number;
}

export interface PermissionState {
  microphone: 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown';
  screen: 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown';
}

export interface DiagnosticEntry {
  id: string;
  timestamp: number;
  level: 'info' | 'warning' | 'error';
  code: string;
  message: string;
}

export interface DiagnosticsSnapshot {
  entries: DiagnosticEntry[];
  overlayClients: number;
  overlayPort: number;
  hasKey: boolean;
  permissions: PermissionState;
}

export interface SessionStateUpdate {
  source: CaptionSource;
  status: SessionStatus;
  attempt?: number;
  errorCode?: string;
}

export const SessionStateUpdateSchema = z.object({
  source: CaptionSourceSchema,
  status: SessionStatusSchema,
  attempt: z.number().int().min(0).max(5).optional(),
  errorCode: z.string().max(80).optional(),
});

export const WindowsAudioApplicationSchema = z.object({
  id: z.string().trim().min(1).max(260),
  name: z.string().trim().min(1).max(120),
  type: z.enum(['win32', 'package']),
  available: z.boolean(),
});

export const WindowsAudioCapabilitySchema = z.object({
  supported: z.boolean(),
  build: z.number().int().nonnegative(),
  reason: z.enum(['available', 'platform', 'windows_build', 'helper_missing']).optional(),
});

export const WindowsAudioCaptureStatusSchema = z.object({
  captureId: z.string().uuid(),
  applicationId: z.string().max(260),
  applicationName: z.string().max(120),
  status: z.enum(['starting', 'live', 'waiting', 'unsupported', 'failed', 'stopped']),
  errorCode: z.string().max(80).optional(),
});

export const WindowsAudioStartInputSchema = z.object({
  applicationId: z.string().trim().min(1).max(260),
  applicationName: z.string().trim().min(1).max(120),
});

export const IPC = {
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  keyStatus: 'key:status',
  keySetAndValidate: 'key:set-and-validate',
  keyValidateStored: 'key:validate-stored',
  keyDelete: 'key:delete',
  realtimeCreateSecret: 'realtime:create-secret',
  captionDelta: 'caption:delta',
  captionClear: 'caption:clear',
  overlayMessage: 'overlay:message',
  overlayConfigUpdate: 'overlay:config-update',
  overlayClients: 'overlay:clients',
  metadataGet: 'app:metadata',
  permissionsGet: 'permissions:get',
  permissionsRequestMicrophone: 'permissions:request-microphone',
  permissionsOpenMicrophoneSettings: 'permissions:open-microphone-settings',
  diagnosticsGet: 'diagnostics:get',
  diagnosticsExport: 'diagnostics:export',
  clipboardWriteText: 'clipboard:write-text',
  sessionState: 'session:state',
  windowsAudioCapability: 'windows-audio:capability',
  windowsAudioList: 'windows-audio:list',
  windowsAudioStart: 'windows-audio:start',
  windowsAudioStop: 'windows-audio:stop',
  windowsAudioPort: 'windows-audio:port',
  windowsAudioStatus: 'windows-audio:status',
} as const;
