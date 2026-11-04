# Spoke Sprint

A public, English browser game for the Squeekchain community: roll a wheel for 20 seconds and compare your distance with Squeektoshi’s actual wheel counter.

Spoke Sprint is a community project for the Squeekchain Buildooooor badge.

Canonical IMD job URL: ____________________

## Install, run and export

Use Node.js 24 and npm. The lockfile pins the build and validation dependencies. The application itself has no runtime package dependencies.

```sh
npm ci
npm run dev
```

Build and preview the production export:

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

`dist/index.html`, `dist/assets/`, `dist/favicon.svg`, and `dist/share.png` are the complete static export and are included in this submission. Serve or pin the contents of `dist/`. Vite uses `base: './'`; scripts, styles, the favicon, and share image have relative URLs. The one-page app uses only a fragment link for help and needs no route rewrites. Live mode uses the public HTTPS API; practice works without network access after the page is loaded. No service worker or cold-load offline cache is claimed.

No backend, account, wallet, credentials, environment file, or contract configuration is needed. Live mode needs working localStorage, a secure browser context, Web Locks, and the public API’s CORS support. If reservation or storage is unavailable, live fails closed and practice remains playable.

## Play

Choose **Race live** or **Practice**, then roll using the large button, the scene, or Space. The first roll is step one and starts the 20-second timer. Each distinct Space press counts once; holding it does not repeat. One step is one game-meter. For comparison with the hardware, one game-meter equals 1,000 mm.

Live makes exactly one `GET https://api.squeekchain.com/v1/status` at the first roll and another at the deadline. It stores `measurement.distanceMm`, `coreStatus`, freshness, observation/generation/receipt times, installation ID, counter epoch, provenance, and explicit round references. There is no polling, automatic retry, or estimated live wheel animation. A finished result opens the raw-counter receipt and announces which side went farther, or why the attempt is void.

The adapter supports the observed v1 schema. It requires safe, nonnegative integer counters, hardware provenance, online telemetry, and valid status/timestamps. It uses the API’s freshness limit capped at 120 seconds, with a five-second tolerance for future timestamps. It rejects a changed installation/epoch, a counter decrease, or an observation that did not advance. Requests time out after eight seconds. A finish delayed by more than 1.5 seconds, or divergent device clocks, also voids live. Player inputs stop at the deadline; hardware sample times are shown because their interval can differ from the input window.

## Round limits and saved results

An explicit `roundId`, `currentRound.id`, `round.id`, or `round.roundId` takes priority. The observed API instead exposes `oracle.latestClosure.lastRound`, which is honestly labeled **Last closed round**. Other actual settlement/closure references are retained in the receipt. These are identifiers returned by the API, never invented current rounds.

Live reservations use `spoke-sprint:live:v1:round:<encoded ID>`. With no returned round reference, they use `spoke-sprint:live:v1:hour:YYYY-MM-DDTHH`, from the first roll’s UTC hour, and the page says so. A used ID remains blocked, including void/interrupted attempts. **Check next round** makes one opening request to inspect the ID and refuses replay when unchanged. The starting round owns the attempt even if a later observation reports another round.

Web Locks serialize admission across tabs; a pending marker protects the opening request. Progress is saved locally. Switching modes or leaving ends a live attempt without inventing a closing counter. `spoke-sprint:live:v1:last` points to the latest reservation for restoration. Local limits apply to this browser/origin, not to people across devices; clearing browser storage removes them.

**Practice — simulated, not live** uses a fixed 60,000 mm / 60 game-meter target. It has a separate control and saves only under `spoke-sprint:practice:v1`, including its own best step count. It never submits requests or becomes a live result. Practice can be repeated, including when live is locked or offline.

## Validation

```sh
npx playwright install chromium
npm run validate:browser
```

The browser script owns and closes a temporary server, checks the actual `dist/` under `/preview/`, and writes results/screenshots to `artifacts/`. For optional live diagnostics:

```sh
npm run validate:live
npm run validate:api
```

The first runs one real 20-second browser attempt. The second requires `curl` and records two real API readings about 20 seconds apart; it does not verify browser CORS. Deterministic test IDs and distances live only in test/validation code.

Actual worker results: production build and strict TypeScript check passed; 24 logic tests and 19 Chromium browser groups passed. Those include a real-time 20-second practice race, keyboard/touch-equivalent controls, offline practice, persistence, telemetry failure states, accessibility scans, 200% text reflow, and no horizontal overflow at 320, 390, 704, and 1440 pixels. The pinned taste probe passed 16/16 checks.

Direct browser API requests received `net::ERR_EMPTY_RESPONSE` in this environment; the unmocked run correctly produced a void result with two requests, five steps, and no gain/winner. Separate real HTTPS API readings were accepted with counters 0 mm → 0 mm and gain 0 mm. Successful live browser CORS end-to-end is therefore **not verified**. The supplied browser tool could not find Chrome; local Playwright Chromium supplied rendered checks. WebKit could not launch because required host libraries were missing. Physical devices, native 200% browser zoom, and screen readers were not tested. See [the validation report](artifacts/validation.md) for evidence, fixes, and limits.

## Source and design

`src/game.ts` owns timing/reservations, `src/telemetry.ts` owns strict status parsing/comparison, `src/main.ts` renders and binds inputs, and `src/scene.ts` contains the original SVG wheel/hamster drawing. [DESIGN.md](DESIGN.md) documents the final tokens and components.

The share card is drawn in `artwork/share.svg`. `node scripts/render-share.mjs` regenerates the local PNG using Playwright; ordinary builds use the included PNG and need no art service. No external images or fonts load at runtime.

The pinned Better Interface guide was applied across all six domains. Design guidance: Jakub Krehel, Better Interface, MIT, commit `267330e1adfc66a718fb65fa6918c1f06d0a689e`. Documentation method: Paul Bakaus, Impeccable, Apache-2.0, commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`. These guides informed an original implementation; their supplied license notices are preserved in [artifacts/design-guidance-LICENSE.txt](artifacts/design-guidance-LICENSE.txt).
