# Live Translate for OBS application specification

This feature binds to `DESIGN.md`. Every screen must read as the same product if placed side by side.

## Product frame

Target users are Twitch streamers who need translated captions while managing OBS under time pressure. The app must be understandable on a second monitor, operable by keyboard and safe when a source fails mid-interview. The production UI is French and English. Visible examples use real product states, never invented performance claims.

## Information architecture

Four destinations live beside the Signal Rail:

1. Direct
2. Apparence
3. Installation OBS
4. Diagnostic

Before setup is complete, navigation is replaced by the onboarding sequence. Settings such as UI language, API key replacement and update status live in a compact utility menu rather than a fifth destination.

## Primary flow: first setup

Goal: reach a verified OBS caption preview in under five minutes.

1. **Welcome and privacy.** Explain that audio travels directly to OpenAI, the API key stays on the computer and no transcript is stored. Primary action: `Configurer`.
2. **API key.** Masked input, link to the OpenAI key page, cost explanation and `Tester la clé`. Loading, invalid, billing unavailable, rate limited and offline states are distinct. Success never reveals the stored key again.
3. **Permissions and sources.** Request microphone first, then system audio. Show two horizontal meters and device selectors. A missing system track includes platform-specific recovery copy.
4. **Caption setup.** Choose target language and mixed or split mode. Explain the live cost difference before selection.
5. **OBS check.** Start the local overlay server, show the real embedded overlay preview, copy the persistent URL and list the 1920 by 1080 OBS settings. `Terminer` enters Direct.

Back preserves completed local settings. Closing the app resumes at the first incomplete step. A denied permission can always be retried without resetting the key.

## Primary flow: go live

1. Direct opens with capture profile, language and URL summary.
2. User presses `Démarrer`.
3. App captures selected tracks and establishes one or two translation sessions.
4. Signal Rail progresses from SOURCE to LINK to OBS; each channel has pending, healthy, warning and stopped states.
5. Caption deltas appear in the preview immediately. The live timer and cost estimate start only after a connection succeeds.
6. User presses `Arrêter`; controls unlock after all local tracks and peer connections close.

Offline or failed sessions retry automatically and show the attempt count only in the app. The overlay keeps the last caption briefly, then clears without displaying errors. After five failures, Direct offers `Réessayer` and `Ouvrir le diagnostic`.

## Screen composition

### Direct

- Left: Signal Rail and compact navigation.
- Center 7 columns: live caption preview as the focal surface, followed by ruled source rows with meters.
- Right 5 columns: target, capture mode, session count, timer and estimated cost in a dense control strip.
- Bottom fixed action dock: one large Start or Stop control, secondary `Tester les sources` action.
- Empty state shows a short setup checklist, not an illustration.

### Apparence

- Full-width live preview above an asymmetric editor.
- Left 8 columns: preview with safe-area guides.
- Right 4 columns: theme segmented control, typography, contrast, position and duration. Advanced values disclose progressively.
- Themes: Signal, Sous-titre, Minimal. They vary only through locked tokens and overlay treatment.

### Installation OBS

- One ordered instruction column with a persistent URL strip and copy state.
- Beside it, a 16:9 diagram of the source safe area and a live connection count.
- Port conflict and expired token states explain consequences before allowing regeneration.

### Diagnostic

- Ruled event list with no transcript text.
- Checks: key, microphone, system audio, OpenAI, overlay server, connected OBS clients and app version.
- Each failed row has one recovery action. Export produces a redacted text report.

## Component briefs

### SignalRail

Props: `channels`, `isLive`, `compact`. Channels contain `source | link | obs`, status, accessible label and optional level. It uses `role=status` with polite announcements only on meaningful transitions. Meters are hidden from screen readers; text status remains. Reduced motion removes meter interpolation.

### SourceStrip

Props: label, device name, level, status, editable and onSelect. It is a ruled row, not a card. Device selection uses Radix Select and remains disabled while live. Empty and permission-denied states replace the level with a single recovery action.

### LiveControl

Props: state `idle | starting | live | reconnecting | stopping | failed`, elapsed seconds, onStart, onStop and onRetry. It is the sole primary button on Direct. Space and Enter activate; starting and stopping are disabled with announced status.

### CaptionPreview

Props: mode, captions, overlay config and connection state. It renders the same overlay component used by OBS, inside a 16:9 safe area. Empty text reads `Votre traduction apparaîtra ici` in the app only. Stream errors are never rendered in the overlay variant.

### ApiKeyStep

Props: state, onValidate and onDelete. The renderer receives only `hasKey` and validation results. Pasting is supported. The value clears from component state immediately after the main process accepts it. Error copy never echoes the key or raw response body.

### OverlayControlPanel

Uses Radix Tabs, Slider, Select and Switch. Each field has a visible label, keyboard path and restored default. Values update preview and persistent overlay clients immediately. Groups contain no more than four visible choices.

### StatusToast

Uses Radix Toast. Success disappears after four seconds; actionable errors persist. `aria-live=polite` for status and `assertive` only when capture cannot continue.

## Responsive and window behavior

- Standard desktop: 1040px and wider, persistent vertical Signal Rail.
- Compact desktop: below 760px, Signal Rail becomes a horizontal status strip and navigation becomes Radix Tabs.
- At minimum window size, controls scroll but the Start/Stop action remains sticky.
- OBS overlay is independent of app window size and scales from its browser viewport using `clamp()`.

## Accessibility

- All text and controls use the recorded AA token pairs from `DESIGN.md`.
- Focus uses a two-pixel accent outline with a two-pixel background offset.
- Full flow is usable with Tab, Shift+Tab, Enter, Space, arrows for Radix controls and Escape for dialogs.
- Connection changes use a single polite live region; caption deltas are not announced continuously.
- Meters pair color with labels and numeric status. Color is never the only signal.
- Reduced motion disables orchestrated entry and meter smoothing.

## State and edge coverage

- Loading: settings hydration, key validation, permission request, device enumeration, peer negotiation and update check.
- Empty: no key, no device, no caption, no OBS client and no diagnostic events.
- Partial: microphone available but system track missing, or one split session connected.
- Error: invalid key, billing required, rate limit, permission denied, dead audio track, network loss, port occupied and overlay token mismatch.
- Recovery: fresh secret and retry, permission deep link, device reselect, confirmed port change, overlay URL recopy and redacted report export.
- Refresh/restart: onboarding step, settings, overlay token and port persist. Captions, audio and live session state do not.

## Design Pre-Flight

- Identity lock: pass. One palette, accent, radius scale, icon family and type pairing.
- Anti-slop: pass. No banned fonts, gradient, glow, repeated card grid, fake metric or decorative status dot.
- State coverage: pass. Loading, empty, partial, success, failure and recovery are specified.
- Accessibility: pass. AA ratios, focus, keyboard, live-region and reduced-motion rules are explicit.
- Layout craft: pass. Signal rail, asymmetric console grid, ruled list and 16:9 preview provide four layout families.
- Cognitive load: pass. Four destinations, one primary live action and progressively disclosed appearance controls.

Self-critique: distinctiveness 4, hierarchy 4, consistency 4, accessibility 3, state coverage 4, copy quality 3, restraint 4, motion motivation 4. Total 30/32. No axis is 2 or lower. No corrective revision required.

## Build handoff

Target agent: `react-vite-tailwind-engineer`.

Design system: Radix Primitives with CSS variables from `DESIGN.md`, local Fontsource packages and Lucide icons. Implement exactly this spec. Theme the design system with our locked tokens; do NOT redesign or re-implement its components.

Acceptance criteria:

- All four application destinations and the five-step onboarding flow are implemented.
- Signal Rail communicates SOURCE, LINK and OBS without color-only meaning.
- The real overlay component is reused in preview and OBS rendering.
- All specified loading, empty, partial, error and recovery states exist.
- Keyboard and reduced-motion behavior pass automated and manual checks.
- No production component introduces colors, fonts, radii or motion outside `DESIGN.md`.
