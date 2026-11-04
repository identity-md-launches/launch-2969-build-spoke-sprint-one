# Spoke Sprint design

## Overview

Spoke Sprint is a single-page wheel race for the Squeekchain community. Two large, drawn wheels carry the visual idea: an amber player wheel and a quiet, stationary real opponent. Timer, scores, mode controls, and roll action form one arena. The game appears before explanatory material. Results lead with the winner or void reason, then distances and raw evidence.

Source of truth: `src/style.css`, `src/main.ts`, `src/scene.ts`, and constants in `src/telemetry.ts`. The site is English and dark-only. Native DOM and TypeScript keep the game small; there is no component framework or runtime asset service.

## Colors

All interface colors are hex tokens in `src/style.css:1`. Semantic tokens reference a small brown/cream/amber palette.

| Semantic token | Value | Job |
| --- | --- | --- |
| `--color-bg` | `#14110e` | Page and dark button text |
| `--color-surface` | `#1d1915` | Game shell and wheel interiors |
| `--color-arena`, `--color-hover` | `#252019` | Scene, selected mode, quiet hover |
| `--color-border` | `#493c2f` | Structural dividers and wheel stands |
| `--color-text`, `--color-focus` | `#f3ead7` | Primary text and keyboard ring |
| `--color-muted` | `#a99a86` | Secondary labels and instructions |
| `--color-accent` | `#e4a15a` | Roll action, player wheel, timer progress |
| `--color-action-hover` | `#f2b774` | Primary hover and interactive wheel highlight |
| `--color-action-text` | `#14110e` | Text on amber |

The decorative hamster also uses `#ba9a71` for fur and `#89674f` for its ear. These are illustration fills, not interface status colors. Outcomes use explicit words; color alone never identifies a winner or failure.

Rendered probe measurements: cream/page 15.73:1, muted/page 6.86:1, muted/game surface 6.37:1, muted/arena 5.89:1, dark text/amber button 8.55:1. These are resolved solid-background measurements, not estimates from the artwork. The focus ring uses cream against the surrounding dark surface with a five-pixel offset.

## Typography

The stack is Arial, Helvetica Neue, sans-serif. No font downloads occur. CSS requests 400, 600, and 700; the operating system selects the actual available faces. A computed family is not evidence of a particular installed font file.

| Token | Size at 16px root | Use |
| --- | --- | --- |
| `--text-small` | 14px | Instructions, metadata, table |
| `--text-body` | 16px | Intro, summaries, normal text |
| `--text-title` | 20px | Racer names, roll label, small headings |
| `--text-heading` | 32px | Timer, desktop result, mobile title |
| `--text-display` | 48px | Desktop product title, result symbol |
| `--text-giant` | 72px | Desktop decorative duration numeral |

Body line height is 1.5; short headings use 1.1, with mobile/result multiline headings at 1.4. Display tracking is −0.05em, mobile title −0.04em, timer/desktop result −0.03em, small headings −0.02em. Body and the timer unit use natural spacing. Headings balance; short prose uses pretty wrapping. Longer help copy is capped at 65ch; result explanations at 70ch. Timers/counters/tables use tabular numbers. Telemetry identifiers wrap anywhere and remain selectable; none are ellipsized.

## Layout

The spacing tokens are 4, 8, 12, 16, 24, 32, and 48px at the default root size. Reuse these rather than adding arbitrary spacing. `.shell` is capped at 1024px with 32px desktop side margins. Header links align to shell edges, with the product heading below. The game groups modes and timer, then paired racers and SVG scene, then the primary action and nearby instructions.

At `44rem` / 704px and below, shell margins become 16px, title becomes 32px, the decorative duration and timer caption disappear, padding tightens, and help becomes a single column. Wheels remain side by side. At `22rem` / 352px and below, toolbar/button insets tighten, the scene’s bottom labels stack, and result totals use one column. Header/toolbar groups wrap under text enlargement. The SVG uses a 760×342 viewBox, fits available width, and has a capped height.

The `.controls` container also has a `17em` query: when space is narrow relative to its text size, the roll button’s decorative wheel and arrow disappear and its label uses the full inner width. This includes small phones and enlarged text, avoiding short word fragments.

Browser checks covered 320, 390, 704, and 1440px. The product and primary action are visible on the initial 390×844 screen. 200% root text enlargement at 390px reflows without horizontal scroll; native browser zoom was not verified. Reading order follows DOM order. Nothing is fixed over content. Help uses an obvious native disclosure.

## Elevation & Depth

The system is flat. One border encloses the game; a different solid arena fill distinguishes the play surface. There are no box shadows, gradients, floating overlays, or nested cards. Simple line work provides depth inside the wheel drawing. Result and help dividers separate normal-flow sections.

## Shapes

The game shell uses a 16px radius, roll action 10px, and quiet mode/scene controls 8px. Wheels and the small mode indicator are circles. The scene is not clipped by the shell, and text containers grow vertically. Borders define structure/selection, not decorative raised surfaces.

## Components

These are source patterns, not an exported component library:

| Pattern | Source | Behavior |
| --- | --- | --- |
| `.mode-controls`, `.mode-button` | `src/main.ts`, `src/style.css` | Native buttons with `aria-pressed`; live/practice selection; practice remains enabled |
| `.timer`, `.time-track` | Same | Stable numeric width; countdown from the first roll; timer is not a noisy live announcement |
| `.scene-button`, `scene` | `src/main.ts`, `src/scene.ts` | Large native roll button containing decorative SVG; same input path as main action |
| `.roll-button` | `src/main.ts`, `src/style.css` | Amber primary action, minimum 64px mobile / 68px desktop; hover, pressed, keyboard focus, checking/disabled states |
| `.game-notice` | `src/main.ts` | Stable polite status region; opening/checking/lock/error/outcome text |
| `.result`, `.receipt` | `src/main.ts` | Focus moves to the result after completion; raw counters open by default; table headers/caption preserve associations |
| `.how-to` | `src/main.ts` | Native details/summary; header help link opens it and navigates to its fragment |

All controls have native keyboard semantics and a two-pixel `:focus-visible` perimeter. Hover treatments are restricted to hover-capable devices. Forced-colors mode uses the system Highlight ring and button borders.

Normal-motion button press scales to 0.96 over 100ms; player wheel steps transition over 100ms, and the simulated practice wheel over 50ms. Transitions name only changed properties. Reduced motion stops both wheel rotations and press scaling; numeric and timer feedback remain. The actual hamster wheel never animates estimated live progress.

## Do’s and don’ts

- Start with `.shell`, the existing spacing tokens, and native HTML. Keep the race above help material.
- Give the main roll action the amber fill; use the quiet mode pattern for peers.
- Preserve the exact practice disclosure and keep practice storage separate.
- Keep full counters, times, round sources, and void reasons available. Never substitute an invented counter or current round.
- Keep motion tied to input or explicitly simulated practice. Do not animate speculative live wheel progress.
- For a future informational view, reuse the shell, typography, disclosure, and definition/table patterns; let it reflow under the same breakpoints. No extra type scale, font service, shadow system, or fixed overlay is needed.
