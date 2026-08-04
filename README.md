# Live Translate for OBS

Live Translate for OBS is a local Windows and macOS application that turns microphone and system audio into translated captions for an OBS Browser Source. Audio streams directly from the Electron renderer to OpenAI Realtime Translation. There is no application account or hosted transcript backend.

## Current preview

The current Windows test build is [`v0.2.0-preview.4`](https://github.com/rmiaouh/live-translate-obs/releases/tag/v0.2.0-preview.4). It is unsigned and intended for testing. Its Windows installer is built from the tagged commit by GitHub Actions and published with a SHA-256 checksum.

- Windows CI: typecheck, lint, automated tests, native MSVC x64 helper build and Squirrel installer generation.
- macOS CI: typecheck, lint, automated tests and application packaging.
- Hardware validation is still required for each real audio setup (Discord/Chrome/Zoom, output device, OBS scene and Windows permissions). A successful CI build cannot simulate every Windows audio driver or routing configuration.

For setup and troubleshooting, see the [French user guide](docs/USER_GUIDE.fr.md). For coding assistants and maintainers, see [AGENTS.md](AGENTS.md).

## What is implemented

- Secure onboarding with a user-provided OpenAI API key.
- OS-backed encrypted key storage in the Electron main process.
- Ephemeral Realtime Translation secrets passed to the isolated renderer.
- Microphone, system-audio and Windows application capture with mixed and split modes.
- Live mute/unmute controls for microphone and guests directly from their source icons.
- French and English UI with thirteen target languages.
- Transparent authenticated overlay at `http://127.0.0.1:17654/overlay?token=…`.
- Shared OBS/preview rendering with automatic pages, vertical roll-up, speaker cards and readable presets.
- Verified clipboard copy feedback and collision-aware, scrollable dropdowns that stay above the action bar.
- Windows Squirrel and macOS DMG packaging configuration.

The app deliberately does not store audio or captions. It does not play the translated audio returned by the model.

## Requirements

- Node.js 22 or newer for development.
- Windows 10/11 x64, or macOS 13 or newer. Per-application capture requires Windows build 20348 or newer; Windows 10 users can use the full Windows mix or a dedicated input.
- OBS Studio.
- An OpenAI API project with billing and access to `gpt-realtime-translate`.

## Development

```bash
npm install
npm start
```

Quality checks:

```bash
npm run typecheck
npm test
npm run lint
```

Create an installer for the current OS:

```bash
npm run make
```

On Windows, `npm run make` also compiles the x64 WASAPI helper with MSVC. Visual Studio Build Tools 2022 and a current Windows SDK are therefore required for local Windows packages.

## OBS setup

1. Finish onboarding and open **Installation OBS**.
2. Copy the persistent local overlay URL.
3. In OBS, add a **Browser Source**.
4. Paste the URL, set width `1920`, height `1080` and FPS `30`.
5. Keep the Browser Source background transparent.
6. Return to **Direct**, test both meters and start translation.

The copy button changes to **Copied!** and shows a confirmation toast only after Electron has written and verified the system clipboard.

The overlay server binds only to `127.0.0.1`. Its token is generated once and retained so existing OBS scenes continue to work after an app restart.

## Audio behavior

- **Mixed:** microphone and guest audio are mixed into one WebRTC track and one OpenAI session. The overlay does not claim to identify speakers.
- **Split:** microphone and guest audio use independent tracks, independent sessions and editable, color-coded Host/Guest cards. Both remain visible during overlapping speech.
- On Windows 11 build 20348 or newer, **Windows application** captures one selected Win32 process tree (for example Discord, Chrome or Zoom) through the documented WASAPI Process Loopback API. The helper streams PCM in memory and reconnects when the application restarts.
- **All Windows audio** uses Chromium/Electron loopback for the complete current output mix, including music and notifications.
- On macOS, the system picker and OS permission are used. Its video track is kept disabled only to preserve Chromium's audio-capture session; it is never displayed, recorded or sent to OpenAI.
- A dedicated/virtual input remains available on Windows 10 or for routing through VoiceMeeter, BlackHole, Sonar or a similar tool.
- Click the microphone or guest icon in **Direct** to mute or unmute that source. The underlying audio track is disabled immediately, including while live; the active OpenAI session is not restarted and its cost does not stop while muted.

Changing devices, language or capture mode while live requires stopping and restarting the sessions.

The input language is detected automatically by `gpt-realtime-translate`. The Translation API currently exposes a configurable output language, not a forced input-language field, so the application does not present a non-functional input selector.

## Security and privacy

- The standard API key is accepted only through a narrow preload bridge, validated in the main process and encrypted with Electron `safeStorage`.
- The renderer receives short-lived client secrets only.
- `contextIsolation`, sandboxing and a restrictive Content Security Policy are enabled.
- Diagnostic logs contain technical state only and redact API keys, bearer tokens and overlay tokens.
- No telemetry is enabled and no audio or translated text is written to disk.

See [PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md).

## License

The application source is released under the [MIT License](LICENSE). Bundled software and font attributions are listed in [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt), which is also included with packaged applications.

## Signing and release builds

Unsigned local packages are suitable for development only. Public releases should provide:

- `APPLE_IDENTITY`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` for macOS signing and notarization.
- `WINDOWS_CERTIFICATE_FILE` and `WINDOWS_CERTIFICATE_PASSWORD` for the Windows installer.
- `LIVE_TRANSLATE_UPDATE_URL` at build time for a static Squirrel-compatible update feed (the release workflow reads the repository variable with the same name).

The release workflow builds a Windows x64 installer and a universal macOS artifact. Signing credentials are never committed.

## Architecture

```text
microphone / guest audio
        │
        ▼
Electron renderer (MediaStream + WebRTC)
        │ short-lived secret
        ▼
OpenAI Realtime Translation
        │ transcript deltas
        ▼
Electron main caption manager
        │ localhost WebSocket
        ▼
OBS Browser Source
```

The OBS page and the in-app preview use the same React caption component on a fixed 1920×1080 canvas. Long utterances are measured against the real typography and paginated at word or Unicode grapheme boundaries instead of being truncated.

The design language and implementation handoff are locked under [`.ulpi/design`](.ulpi/design/DESIGN.md).
