# Security policy

## Reporting a vulnerability

Do not include API keys, audio, transcripts or personal data in a report. Use a private security advisory in the repository that distributes this application.

## Security boundaries

- The Electron main process owns the standard OpenAI key and local filesystem access.
- The sandboxed renderer communicates through a narrowly scoped preload API.
- The Windows audio sidecar is spawned without a shell, accepts only a numeric process ID, and streams PCM through inherited local pipes.
- The OBS HTTP/WebSocket server binds to loopback and requires a persistent random token for caption access.
- External navigation is blocked in the application window and opened through the operating system browser only for HTTPS URLs.
- Production builds require code signing and macOS notarization.

Run `npm audit --omit=dev`, `npm run typecheck`, `npm test` and `npm run lint` before release.
