# Spoke Sprint validation

Worker review of the production export, 4 November 2026. These are local observations, not independent network certification.

## Scope and assumptions

One English browser game, its live/practice/result/error states, local attempt limits, and the static `dist/` export. The visual idea is two wheel drawings in a dark amber arena, with a large input action rather than a marketing page.

The step conversion is explicitly 1 game-meter = 1,000 mm. Practice uses a fixed 60,000 mm target. The actual API has a last closed round reference; it is identified as such, not represented as an active/current round. No server, wallet, shared leaderboard, account, credentials, or payment flow is part of the game. The canonical job URL is intentionally left for IMD to fill.

## Requirement coverage

| Requirement | Result and evidence |
| --- | --- |
| Finished 20-second browser game | Implemented; real native-timer practice race completes; game visible on first 390px screen |
| Button, Space, and scene each roll one fixed step | Checked in Chromium; held Space adds no repeated steps; deadline inputs cannot extend the race |
| Two real status reads, no invented gain | Exactly two GETs in fixture and unmocked runs; no polling or automatic retries; raw opening/closing values shown |
| Same installation and counter epoch | Required in `continuityProblem`; changed installation/epoch and decreased counter yield void |
| Missing schema, stale data, or failed request | Checked with fixtures; invalid results have a reason, no gain, and no winner |
| Raw counters, gain, player steps, farther side, endpoint link | Open receipt and result summary; 320px long-value wrapping checked |
| One live attempt per round / UTC hour fallback | Local reservation, reload refusal, changed ID/hour tests; last-closed-round source labeled; local-only limit disclosed |
| Separate, always-available practice | Offline completion, repeated runs, fixed disclosure/target, separate storage, and mode changes tested |
| Required colors, English, large target, responsive layout | Source tokens and rendered review; no horizontal scroll at 320, 390, 704, 1440px |
| No external/generated images or wallet infrastructure | Original inline SVG; local favicon/share PNG; no runtime package dependencies or wallet/backend code |
| Static export and reproducible source/lockfile | Included; relative URLs checked by serving actual export under `/preview/` |
| Metadata and first-screen action | Title, favicon, description, og:title, local 1200×630 og:image; first-screen button asserted at supported widths |
| Documentation and design review | README run/build/validation instructions, exact community-project sentence, canonical URL line; root DESIGN.md; all six domains reviewed below |
| 8 MiB limit / clean packaging | Conservative byte audit in `bundle-audit.json`; dependencies/caches only in excluded scratch; no dependency archives or submodules in delivery |

## Actual commands and results

| Command | Actual outcome |
| --- | --- |
| `npm ci` in `test/scratch/tooling` using the submitted manifest/lockfile | Installed build/check tools; no root `node_modules/` edits; scratch/cache excluded from submission |
| `npm run typecheck` | Exit 0; strict TypeScript, no emit |
| `npm test` | Exit 0; 24/24 logic tests |
| `npm run build` | Exit 0 after final source/CSS changes; Vite production export, includes typecheck |
| `npm run validate:browser` | Exit 0; 19 Chromium groups; fixture live race, void cases, replay, offline practice, accessibility, text enlargement, native 20-second timer |
| `node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` | Exit 0; 16/16 checks on final export |
| `npm run validate:live` | Exit 0; real native browser timer, two unmocked API requests, five steps; transport failed with `net::ERR_EMPTY_RESPONSE`; correctly void, no gain/winner, no script errors |
| `npm run validate:api` | Exit 0; two actual HTTPS/curl readings about 20 seconds apart, counters 0 → 0 mm, same installation/epoch, advancing observations, accepted 0 mm gain |

Build and browser commands used the dependencies installed in scratch through PATH and the scripts’ `IMD_PLAYWRIGHT` / `IMD_AXE` module-path overrides. Normal fresh installs use `npm ci` and the README commands without overrides. Browser executables and package caches are not included.

The native-clock check matters: an initial fake-clock-only pass missed a browser timer binding error. The final browser suite includes a real 20-second run and reports zero script errors. Test fixture distances/IDs exist solely in tests and validation scripts; the production bundle contains no fixture telemetry.

## Better Interface: six domains

| Domain | Coverage | Evidence / limits |
| --- | --- | --- |
| Accessibility | Checked | Native buttons/links/details, named scene, skip link, ARIA pressed/status/timer, keyboard path, result focus, minimum 44px comfortable controls, visible focus screenshot, reduced-motion rotations stopped. Axe scans found zero tested WCAG A/AA violations in ready, live-result, and practice-result states. No screen-reader or physical-device session. |
| Layout | Checked | Initial 320/390/704/1440 layouts, long 320px receipts, help disclosure, first-screen action, no overflow, 200% text enlargement. Toolbar wraps; narrow text containers remove decorative button icons. Native 200% browser zoom not performed. RTL/localization not applicable to this English-only game. |
| Writing | Checked | Verb-led actions, exact units, local-only limits, explicit simulation label, plain void reasons, historical round source, live movement left unknown until finish. No badge/approval/whitelist claim in the game. |
| Typography | Checked | Six-token scale, three requested weights, one sans stack, balanced headings, natural body spacing, tabular numbers, selectable/wrapping data. Computed family checked; no claim about installed physical font files. |
| Colors | Checked | Required hex values; semantic aliases; opaque text backgrounds; probe minimum measured text ratio 5.89:1. Named pairs recorded in DESIGN.md. Decorative SVG fur/line work is not text. Dark-only; no light-theme requirement. |
| UI | Checked | Ready, running/opening, finish checking, valid/void/locked results, storage failure, repeat practice; no estimated live animation, no overlay/shadow nesting, limited transitions, disabled finish action, active practice control. Hover/pressed declarations reviewed; slow-motion Animation-panel replay not performed. |

The exact mandated text **“Practice — simulated, not live”** intentionally retains an em dash. It takes precedence over the probe guide’s generic glyph preference. The initial-screen probe does not inspect every interactive state; those states were reviewed by the interaction suite and source review.

## Findings, corrections, and rechecks

All findings below were fixed. Locations identify the final source, not generated bundles.

| Severity / domain | Location and finding | Fix and recheck |
| --- | --- | --- |
| High / UI | `src/game.ts:93`: native `clearTimeout` was passed as an unbound dependency. An unmocked run hit “Illegal invocation” at the deadline and stayed running. | Wrapped cancellation in an arrow function. Native 20-second practice and unmocked live runs finish with zero script errors. |
| High / layout | `src/style.css:77`: at 390px with 200% text, the nonwrapping toolbar caused 481px horizontal content width. | Wrapped header/mode/toolbar groups and allowed names/control labels to reflow. Repeated text enlargement reports scrollWidth = clientWidth. |
| Medium / layout | `src/style.css:128`: the enlarged label had space for very short fragments because decorative icons consumed its width. Source-only/no-overflow checks did not expose readability. | A 17em control container query hides the decorative icons and gives the label full width. Final enlarged-text screenshot inspected. |
| Medium / accessibility | `src/main.ts:175`: disabling CSS transitions alone left JS-driven practice rotation active for reduced motion. | Both wheel rotations now stay at zero for that preference; numeric feedback remains. Browser assertions and probe pass. |
| Medium / typography | `src/style.css:85`: the 16px timer unit inherited −0.06em tracking from the timer. | Set its tracking to zero. Repeated taste probe passes tracking, 16/16 overall. |
| Medium / accessibility | `src/main.ts:159`: a completed result below the game could be missed without focus/navigation feedback. | Outcome is announced in the stable status region; completion focuses the result. Keyboard check confirms active element `result`. |
| Medium / UI integrity | `src/game.ts:295`: interrupted progress and corrupt stored records needed reliable handling. | Save live progress, validate saved shapes, preserve owned reservations, and reject corrupted state. Unit tests cover reload counts, malformed JSON/shapes, tabs, and clock jumps. |

## Evidence and limitations

- `browser-validation.json`: final 19-group browser outcomes and WebKit limitation.
- `design-probe.json`: final 16 checks plus actual resolved contrast samples.
- `spoke-sprint-390.png`, `spoke-sprint-1440.png`: final initial layouts.
- `spoke-sprint-focus.png`: the cream ring visibly surrounds the primary action at 390px.
- `spoke-sprint-live-result.png`: fixture-driven result layout, deliberately identifiable fixture IDs; not a real hardware race claim.
- `live-smoke.json`: actual browser request failures and correct void handling.
- `api-pair.json`: actual public API observations and accepted counter comparison via curl.
- `bundle-audit.json`: export inventory/hashes and conservative submission byte count.

The supplied browser tool returned “Chromium distribution 'chrome' is not found”; local Playwright Chromium was used successfully. WebKit could not launch due to missing host libraries including GTK4/GStreamer, so Safari behavior is not verified. Chromium’s direct public API transport returned empty responses here while curl reached the service; a successful real browser/CORS live comparison is not verified. No external service availability is promised.

Native mobile devices, screen readers, native zoom, forced-colors rendering, and slowed Animation-panel inspection remain unperformed. 200% text reflow is a separate completed check. Local browser storage can be cleared; no cross-device or shared anti-cheat system is claimed. API hardware provenance is trusted as reported, not independently attested by this static client.

Implementation, export, and required local build/interaction/design checks are complete for the stated scope, with these explicit verification limits. Hosting and the canonical IMD URL are after delivery.
