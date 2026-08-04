# Privacy

Live Translate for OBS is designed for local, ephemeral processing.

## Data sent to OpenAI

When translation is running, the selected microphone and guest/system audio tracks are sent directly from the application to the OpenAI Realtime Translation API. OpenAI processes that audio under the terms and data controls of the API project associated with the user's key.

## Data stored locally

- Application settings, including the overlay port, theme and device preferences.
- On Windows, the stable executable name and display name of the selected guest application. Process IDs are temporary and are not persisted.
- The OpenAI API key encrypted with operating-system-backed Electron `safeStorage`.
- A random installation identifier. Only its SHA-256 hash is sent as the OpenAI safety identifier.
- Redacted technical diagnostics without audio or caption text.

Audio and translated captions are not written to disk. The application does not include analytics or a developer-operated backend.

The Windows process-loopback helper writes raw PCM only to an anonymous pipe connected to the Electron process. It does not create recordings or temporary audio files.

## Deletion

The API key can be deleted from the app. Removing the application data directory removes settings, the encrypted key and local diagnostics.
