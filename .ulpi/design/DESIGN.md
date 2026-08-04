---
project: Live Translate for OBS
register: product
aesthetic_direction: industrial / signage
color_strategy: restrained
design_system: Radix Primitives
design_variance: 7
motion_intensity: 3
visual_density: 7
---

# Live Translate for OBS design language

## Design Read

A calm nocturnal broadcast console where every state reads in one glance and the live signal, not decoration, owns the room.

## Signature

The **Signal Rail** is a narrow persistent status spine. It stacks three labelled channels, SOURCE, LINK and OBS, beside honest level bars. The rail turns the invisible path from microphone to audience into the product's memorable object. It is the only expressive element; surrounding surfaces stay flat, ruled and disciplined.

## Register and system

This is a product UI. Build on Radix Primitives for accessible dialogs, switches, selects, tabs, tooltips and toasts. Theme the primitives with the locked tokens below. Use Lucide as the single icon family. Do not recreate Radix interaction behavior by hand.

## Color, locked

No gradients, glass, glows or raw neutral grays. Accent occupies less than ten percent of any view.

| role | OKLCH | hex | use |
|---|---|---|---|
| background | `oklch(16.9% 0.016 211.2)` | `#071113` | app canvas |
| surface | `oklch(21.1% 0.020 212.7)` | `#0D1B1E` | primary work surfaces |
| elevated | `oklch(25.4% 0.024 209.1)` | `#142629` | popovers and active strips |
| text | `oklch(97.2% 0.007 160.1)` | `#F2F7F4` | primary text |
| muted | `oklch(76.3% 0.018 183.4)` | `#A6B6B3` | secondary copy |
| subtle | `oklch(59.0% 0.019 187.5)` | `#71817F` | metadata and disabled large text only |
| border | `oklch(35.4% 0.030 209.0)` | `#284044` | rules and controls |
| accent | `oklch(82.4% 0.150 73.7)` | `#FFB545` | live action, focus and selected values |
| success | `oklch(74.2% 0.136 157.3)` | `#54C589` | healthy connection |
| warning | `oklch(84.6% 0.134 87.9)` | `#F1C75B` | recoverable attention |
| danger | `oklch(71.2% 0.181 22.8)` | `#FF6B6B` | stopped or destructive state |
| info | `oklch(73.9% 0.088 218.8)` | `#65B8D0` | neutral system information |

Recorded WCAG contrast ratios: text/background 17.65:1, muted/background 9.07:1, subtle/background 4.69:1, accent/background 10.88:1, text/surface 16.25:1, muted/surface 8.35:1, background/accent 10.88:1. `subtle` on elevated is restricted to large or nonessential metadata because it is 3.85:1.

## Type, locked

Bundle fonts locally. Network fonts are forbidden in the app and OBS overlay.

| role | family | use | notes |
|---|---|---|---|
| display | Barlow Condensed 600/700 | page titles, live timer, short labels | uppercase allowed for channel labels; tracking `0.04em` |
| body | IBM Plex Sans 400/500/600 | controls and explanatory copy | reading measure capped at 70ch |
| utility | IBM Plex Mono 400/500 | device names, costs, ports, status data | tabular numerals |

Type scale: `12, 14, 16, 18, 24, 32, 48, 64px`. Body line-height is 1.5; display line-height is 0.95 to 1.1.

## Scales, locked

- Spacing: `0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96px`.
- Radius: `sm 4px`, `md 8px`, `lg 12px`, `full 9999px`. Controls use `sm`; panels use `md`; dialogs use `lg`.
- Borders: one-pixel solid rules. Active channels may use a two-pixel accent inset, never a shadow glow.
- Elevation: `sm 0 8px 24px rgb(0 0 0 / 0.18)`, `md 0 18px 54px rgb(0 0 0 / 0.28)`.
- Motion: `fast 120ms`, `base 300ms`, `emphasis 500ms`; easing `cubic-bezier(0.16, 1, 0.3, 1)`. Exit is 75 percent of enter. No bounce. Honor reduced motion.
- Z layers: base 0, dropdown 20, sticky 30, fixed 40, modalBackdrop 45, modal 50, tooltip 60, toast 70, skipLink 80.
- Breakpoints: compact 760px, standard 1024px, wide 1440px. The desktop window minimum is 1040 by 700.

## Composition rules

- Use ruled lists, asymmetric work surfaces and stat strips. Never arrange three equal cards.
- The Signal Rail is 88px wide on standard layouts and becomes a horizontal strip below 760px.
- Keep one primary action per view. On the live dashboard it is Start or Stop.
- Panels never nest inside panels. Sections are separated by rules and spacing.
- Data aligns to a twelve-column console grid; onboarding uses a 5/7 split between explanation and active step.

## Voice

Register: plain, calm and technical. Use the action vocabulary `Tester`, `Autoriser`, `Démarrer`, `Arrêter`, `Copier`, `Réessayer`. Explain what is sent before requesting permission. Never claim that a connection is ready before it has produced a healthy event.

## Cross-session consistency

Every screen must read as the same product if placed side by side.

Read this file before every later feature. Any new visual value must first be added deliberately here.
