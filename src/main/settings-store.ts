import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import {
  AppSettingsSchema,
  OVERLAY_PRESETS,
  type AppSettings,
  type DensityPreset,
  type OverlayConfig,
  type SettingsPatch,
} from '../shared/contracts';

const LegacyCaptureProfileSchema = z.object({
  mode: z.enum(['mixed', 'split']).default('mixed'),
  microphoneDeviceId: z.string().nullable().default(null),
  guestSource: z.enum(['system', 'input']).default('system'),
  guestDeviceId: z.string().nullable().default(null),
  hostLabel: z.string().trim().min(1).max(32).default('Hôte'),
  guestLabel: z.string().trim().min(1).max(32).default('Invités'),
});

const LegacyOverlaySchema = z.object({
  theme: z.enum(['signal', 'subtitle', 'minimal']).default('signal'),
  fontSizePx: z.number().int().min(32).max(96).default(64),
  textColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#F2F7F4'),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#FFB545'),
  backgroundOpacity: z.number().min(0).max(1).default(0.76),
  position: z.enum(['top', 'center', 'bottom']).default('bottom'),
  maxWidthPercent: z.number().int().min(40).max(94).default(78),
  maxLines: z.literal(2).default(2),
  displayDurationMs: z.number().int().min(2000).max(12000).default(6000),
  showLabels: z.boolean().default(true),
});

const LegacyAppSettingsSchema = z.object({
  version: z.literal(1).default(1),
  locale: z.enum(['fr', 'en']).default('fr'),
  onboardingStep: z.number().int().min(0).max(5).default(0),
  onboardingComplete: z.boolean().default(false),
  installationId: z.string().uuid(),
  overlayPort: z.number().int().min(1024).max(65535),
  overlayToken: z.string().min(32),
  targetLanguage: z.enum(['en', 'fr', 'es', 'pt', 'de', 'it', 'zh', 'ja', 'ko', 'ru', 'hi', 'id', 'vi']),
  captureProfile: LegacyCaptureProfileSchema,
  overlay: LegacyOverlaySchema,
});

export class SettingsStore {
  private readonly filePath: string;
  private cached: AppSettings | null = null;
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(private readonly userDataPath: string) {
    this.filePath = path.join(userDataPath, 'settings.json');
  }

  async get(): Promise<AppSettings> {
    if (this.cached) return structuredClone(this.cached);

    try {
      const value = JSON.parse(await readFile(this.filePath, 'utf8')) as unknown;
      this.cached = migrateSettings(value);
      if (isLegacySettings(value)) await this.persist(this.cached);
    } catch {
      this.cached = AppSettingsSchema.parse({
        installationId: randomUUID(),
        overlayToken: randomBytes(24).toString('hex'),
      });
      await this.persist(this.cached);
    }

    return structuredClone(this.cached);
  }

  async update(patch: SettingsPatch): Promise<AppSettings> {
    let next!: AppSettings;
    const mutation = this.mutationQueue.then(async () => {
      const current = await this.get();
      next = AppSettingsSchema.parse({ ...current, ...patch });
      await this.persist(next);
      this.cached = next;
    });
    this.mutationQueue = mutation.then(() => undefined, () => undefined);
    await mutation;
    return structuredClone(next);
  }

  private async persist(settings: AppSettings): Promise<void> {
    await mkdir(this.userDataPath, { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    await rename(temporaryPath, this.filePath);
  }
}

export function migrateSettings(value: unknown): AppSettings {
  const current = AppSettingsSchema.safeParse(value);
  if (current.success) return current.data;

  const legacy = LegacyAppSettingsSchema.parse(value);
  const preset = closestPreset(legacy.overlay.fontSizePx, legacy.overlay.maxWidthPercent);
  const presetValues = OVERLAY_PRESETS[preset];
  const overlay: OverlayConfig = {
    theme: legacy.overlay.theme,
    readingMode: 'pages',
    densityPreset: preset,
    fontSizePx: presetValues.fontSizePx,
    maxWidthPercent: presetValues.maxWidthPercent,
    maxLines: presetValues.maxLines,
    textColor: legacy.overlay.textColor,
    hostAccentColor: '#66D9EF',
    guestAccentColor: legacy.overlay.accentColor,
    backgroundOpacity: legacy.overlay.backgroundOpacity,
    position: legacy.overlay.position,
    displayDurationMs: legacy.overlay.displayDurationMs,
    showLabels: legacy.overlay.showLabels,
  };

  return AppSettingsSchema.parse({
    ...legacy,
    version: 2,
    captureProfile: {
      ...legacy.captureProfile,
      guestApplicationId: null,
      guestApplicationName: null,
    },
    overlay,
  });
}

function closestPreset(fontSizePx: number, maxWidthPercent: number): DensityPreset {
  const candidates: DensityPreset[] = ['large', 'balanced', 'moreText'];
  return candidates.reduce((best, candidate) => {
    const current = OVERLAY_PRESETS[candidate];
    const selected = OVERLAY_PRESETS[best];
    const currentDistance = Math.abs(current.fontSizePx - fontSizePx) + Math.abs(current.maxWidthPercent - maxWidthPercent);
    const selectedDistance = Math.abs(selected.fontSizePx - fontSizePx) + Math.abs(selected.maxWidthPercent - maxWidthPercent);
    return currentDistance < selectedDistance ? candidate : best;
  }, 'balanced');
}

function isLegacySettings(value: unknown): boolean {
  return Boolean(value && typeof value === 'object' && 'version' in value && value.version === 1);
}
