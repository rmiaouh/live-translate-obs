# Repository guide for coding assistants

This file is the concise source of truth for an LLM or coding agent working on Live Translate for OBS. Read it before changing the project.

## Product contract

- Electron + React + TypeScript application for translated OBS captions.
- Fixed model: `gpt-realtime-translate` through `/v1/realtime/translations`.
- Input language is automatically detected. Only `session.audio.output.language` is configurable. Do not add a fake source-language selector and do not add `gpt-realtime-whisper` unless the product scope explicitly changes.
- Never play the translated audio track. The product outputs subtitles only.
- Never persist audio, PCM, captions or transcripts.
- Mixed mode uses one session and must not claim speaker identification.
- Split mode maps microphone to `host` and the guest source to `guest` with independent sessions and captions.
- Keep the overlay port/token stable across migrations so existing OBS URLs continue to work.

## Architecture map

- `src/main/`: Electron lifecycle, settings/key storage, OpenAI client-secret creation, caption aggregation, localhost overlay server and Windows native-service orchestration.
- `src/preload/`: narrow `contextBridge` API. Do not expose raw `ipcRenderer` or Node primitives.
- `src/renderer/`: onboarding, Direct/Appearance/OBS/Diagnostics UI, browser audio capture, WebRTC and the PCM `AudioWorklet`.
- `src/renderer/overlay/OverlayStage.tsx`: shared caption renderer used by both the app preview and OBS. Do not create a second overlay implementation.
- `src/overlay/`: standalone OBS browser-page entrypoint.
- `src/shared/`: Zod contracts, IPC channel names, caption layout, cost and redaction helpers.
- `native/windows-audio-capture/`: MSVC x64 WASAPI Process Loopback helper.

## Security invariants

- The standard OpenAI API key belongs only in the Electron main process and is stored with `safeStorage`.
- The renderer receives short-lived client secrets only.
- Clipboard writes and other privileged operations go through explicit, validated IPC handlers.
- Keep `contextIsolation: true`, `nodeIntegration: false`, sandboxing and the restrictive CSP.
- Bind the overlay server to `127.0.0.1` only and require its token for captions.
- Do not include keys, bearer tokens, overlay tokens, audio or translated text in logs/errors.
- Spawn the Windows helper without a shell and validate every argument.

## Windows audio contract

- Per-application capture requires Windows build 20348+ and uses `ActivateAudioInterfaceAsync` with `AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS`.
- The helper captures the selected root process and children, emits float32 mono 48 kHz PCM on stdout, and emits redacted technical states only on stderr.
- Application identity is persisted by executable/package identity, never by PID.
- Windows 10 falls back to full system loopback or a dedicated/virtual input.
- Muting a source toggles its audio track immediately; it does not stop or discount an active OpenAI session.

## UI invariants

- All dropdowns use the shared `SelectField`. Its portal must remain above the sticky action bar, reserve bottom collision space and stay scrollable inside the viewport.
- OBS URL copy buttons must use the secure clipboard bridge and show both success and failure feedback.
- Microphone/guest source icons in Direct are interactive mute buttons with visible, persisted and accessible state.
- Devices, target language and capture mode remain locked while live; mute buttons remain available.
- Technical errors are shown in the app, never in the OBS overlay by default.

## Settings and concurrency

- Current settings schema version is 2. Additive fields need safe defaults for existing v2 files.
- Preserve API key storage, installation ID, overlay port and overlay token during migrations.
- `SettingsStore` serializes mutations. Do not reintroduce concurrent writes to the same temporary file or bypass validation.
- Captions/page queues/PCM remain memory-only.

## Required checks

```bash
npm run typecheck
npm run lint
npm test
npm run package
```

Windows release validation additionally requires `npm run make -- --platform=win32 --arch=x64` on a Windows runner with MSVC and a current Windows SDK. CI compilation proves build integrity, not every real driver/Discord/OBS routing combination; keep hardware acceptance testing explicit.

Preview tags matching `v*-preview.*` publish an unsigned Windows installer and SHA-256 through `.github/workflows/windows-preview.yml`. Public distribution requires code signing.
