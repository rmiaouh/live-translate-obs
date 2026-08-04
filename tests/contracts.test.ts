import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AppSettingsSchema,
  DEFAULT_OVERLAY_PORT,
  IPC,
  OVERLAY_PRESETS,
  TARGET_LANGUAGES,
} from '../src/shared/contracts';
import { migrateSettings, SettingsStore } from '../src/main/settings-store';

describe('application contracts', () => {
  it('hydrates safe defaults for a fresh installation', () => {
    const settings = AppSettingsSchema.parse({
      installationId: '123e4567-e89b-12d3-a456-426614174000',
      overlayToken: 'a'.repeat(48),
    });

    expect(settings.overlayPort).toBe(DEFAULT_OVERLAY_PORT);
    expect(settings.targetLanguage).toBe('fr');
    expect(settings.version).toBe(2);
    expect(settings.captureProfile.mode).toBe('mixed');
    expect(settings.captureProfile.microphoneEnabled).toBe(true);
    expect(settings.captureProfile.guestsEnabled).toBe(true);
    expect(settings.overlay.densityPreset).toBe('balanced');
    expect(settings.overlay.readingMode).toBe('pages');
    expect(settings.overlay.maxLines).toBe(2);
  });

  it('contains the thirteen supported output languages without duplicates', () => {
    expect(TARGET_LANGUAGES).toHaveLength(13);
    expect(new Set(TARGET_LANGUAGES.map(({ code }) => code)).size).toBe(13);
  });

  it('keeps every privileged IPC channel explicit and unique', () => {
    const channels = Object.values(IPC);
    expect(new Set(channels).size).toBe(channels.length);
    expect(IPC.clipboardWriteText).toBe('clipboard:write-text');
  });

  it('serializes rapid settings updates without losing either change', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'live-translate-settings-'));
    try {
      const store = new SettingsStore(directory);
      const initial = await store.get();
      await Promise.all([
        store.update({
          captureProfile: { ...initial.captureProfile, microphoneEnabled: false },
        }),
        store.update({ locale: 'en' }),
      ]);
      const current = await store.get();
      expect(current.captureProfile.microphoneEnabled).toBe(false);
      expect(current.locale).toBe('en');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects invalid overlay ports and unsupported languages', () => {
    const base = {
      installationId: '123e4567-e89b-12d3-a456-426614174000',
      overlayToken: 'a'.repeat(48),
    };
    expect(() => AppSettingsSchema.parse({ ...base, overlayPort: 80 })).toThrow();
    expect(() => AppSettingsSchema.parse({ ...base, targetLanguage: 'xx' })).toThrow();
  });

  it('migrates v1 while preserving the OBS URL identity and audio source', () => {
    const migrated = migrateSettings({
      version: 1,
      locale: 'fr',
      onboardingStep: 5,
      onboardingComplete: true,
      installationId: '123e4567-e89b-12d3-a456-426614174000',
      overlayPort: 17654,
      overlayToken: 'z'.repeat(48),
      targetLanguage: 'fr',
      captureProfile: {
        mode: 'split', microphoneDeviceId: 'mic', guestSource: 'system', guestDeviceId: null,
        hostLabel: 'Moi', guestLabel: 'Interview',
      },
      overlay: {
        theme: 'signal', fontSizePx: 64, textColor: '#F2F7F4', accentColor: '#FFB545',
        backgroundOpacity: 0.76, position: 'bottom', maxWidthPercent: 78, maxLines: 2,
        displayDurationMs: 6000, showLabels: true,
      },
    });

    expect(migrated.version).toBe(2);
    expect(migrated.overlayPort).toBe(17654);
    expect(migrated.overlayToken).toBe('z'.repeat(48));
    expect(migrated.captureProfile.guestSource).toBe('system');
    expect(migrated.captureProfile.microphoneEnabled).toBe(true);
    expect(migrated.captureProfile.guestsEnabled).toBe(true);
    expect(migrated.overlay.densityPreset).toBe('balanced');
    expect(migrated.overlay).toMatchObject(OVERLAY_PRESETS.balanced);
  });
});
