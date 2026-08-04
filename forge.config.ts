import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { VitePlugin } from '@electron-forge/plugin-vite';

const osxSign = process.env.APPLE_IDENTITY
  ? { identity: process.env.APPLE_IDENTITY }
  : undefined;

const osxNotarize =
  process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID
    ? {
        appleId: process.env.APPLE_ID,
        appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
        teamId: process.env.APPLE_TEAM_ID,
      }
    : undefined;

const extraResource = ['resources/overlay-dist', 'LICENSE', 'THIRD_PARTY_NOTICES.txt'];
if (process.platform === 'win32') {
  extraResource.push('native/windows-audio-capture/bin/x64/Release/windows-audio-capture.exe');
}

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    icon: 'resources/icons/icon',
    appBundleId: 'com.livetranslate.obs',
    appCategoryType: 'public.app-category.video',
    extraResource,
    extendInfo: {
      LSMinimumSystemVersion: '13.0',
      NSMicrophoneUsageDescription:
        'Live Translate captures your microphone to create translated captions.',
      NSAudioCaptureUsageDescription:
        'Live Translate captures system audio to translate remote interview guests.',
      NSScreenCaptureUsageDescription:
        'Live Translate uses screen audio capture to receive system sound. Video is discarded.',
    },
    osxSign,
    osxNotarize,
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      name: 'live_translate_obs',
      setupExe: 'Live-Translate-for-OBS-Setup.exe',
      ...(process.env.WINDOWS_CERTIFICATE_FILE && process.env.WINDOWS_CERTIFICATE_PASSWORD
        ? {
            certificateFile: process.env.WINDOWS_CERTIFICATE_FILE,
            certificatePassword: process.env.WINDOWS_CERTIFICATE_PASSWORD,
          }
        : {}),
    }),
    new MakerZIP({}, ['darwin']),
    new MakerDMG({
      name: 'Live Translate for OBS',
      format: 'ULFO',
    }),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      build: [
        {
          entry: 'src/main/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
  ],
};

export default config;
