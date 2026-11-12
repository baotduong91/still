# Verification — 2026-11-10

Tested locally on macOS with Node 24.15.0, Next.js 16.4.6, Prisma 6.19.3, PostgreSQL 16 (disposable Docker container), and installed Google Chrome through Playwright. No model keys were needed.

| Check | Observed result |
|---|---|
| Strict TypeScript | `npm run typecheck` passed; production Next build also typechecked. |
| Unit / service contracts | `npm test`: **40 passed**, 2 files. |
| Production build | `npm run build`: passed; all app pages and API/discovery routes generated. |
| Browser end-to-end | `npm run test:e2e`: **10 passed** in the final run. |
| Automated accessibility | Axe WCAG 2 A/AA and WCAG 2.1 AA tags: no violations on tested Today light mode and Settings dark mode. |
| Database migration | Initial migration applied successfully to an empty PostgreSQL database. |
| Scripture seed | **31,103 exact WEB records** inserted transactionally; 66 books validated. |
| PostgreSQL integration | Exact corpus retrieval, plan persistence, owner isolation, stale-revision rejection, and concurrent journal idempotency passed. |
| Dependency audit | `npm audit`: **0 vulnerabilities** reported at verification time. |
| Visual review | Desktop at 1440px, mobile at 390px, and mobile dark mode inspected. No horizontal overflow in the mobile test. |
| Browser errors | Final screenshot capture: **0 uncaught browser errors**. |

## Covered user flows

- A first visit starts a real Day 1, progresses through Scripture → reflection → prayer → practice, persists completion, and opens Day 2 after reload.
- A grief prompt produces a distinct journey and opens its first day directly.
- Scripture retrieval returns the exact source record, rejects invalid book/chapter/verse ranges, and explicitly labels CSB → WEB fallback.
- Verse highlights and notes survive immediate reload, including recovery from a pending browser write.
- Chat separates commentary from exact expandable citations; unsupported questions abstain.
- After offline download, app navigation, a verse in Revelation, and saved journal entries work without network.
- Offline completion reconnects, synchronizes the server revision, and permits subsequent adaptation.
- Verse artwork produces a downloadable PNG.
- Both discovery URLs return the same valid JSON.
- Every declared AWP endpoint is invoked by contract tests and its result validated against the generated response schema.
- Mock model enhancement cannot replace quoted Scripture; invalid model citations are rejected; Ollama failure does not fall through to cloud.

## Fixes validated during development

The browser tests exposed an incomplete-save/reload race and a localhost/127.0.0.1 origin mismatch. Browser writes now use a short-lived synchronous recovery record before IndexedDB commit, and UI success awaits persistence. Origin validation uses the explicit SITE_URL when configured, otherwise the incoming host. Secondary text contrast was darkened to pass automated checks. Offline completion synchronization now carries the server revision forward.

Turbopack’s CSS subprocess could not bind its internal port in this host sandbox. The delivered dev/build scripts use supported Next.js webpack mode; the final production build passed with that configuration.

## Limits of this verification

- Cloud and Ollama integrations were tested with mocks and failure paths, not paid or user-owned live models. Configure and quality-check a chosen model before use.
- CSB, NLT, NIV, and ESV were not imported or tested with copyrighted text. Only WEB is bundled. Their loader, preference, and fallback interfaces are present.
- Production is a personal Vercel deployment (https://still-ten.vercel.app), not load-tested or hardened as multi-tenant SaaS. Hosted Ollama requires a completed Cloudflare Tunnel; see [OLLAMA-TUNNEL.md](OLLAMA-TUNNEL.md).
- Automated accessibility checks do not certify accessibility. Manual screen-reader, iOS Safari installation, browser storage eviction, and native speech voice behavior were not exhaustively tested.
- Offline-created plans/adaptations remain local; cross-device synchronization and account recovery are not implemented.
- A PWA supports home-screen installation/shortcuts and exported wallpaper, not native lock-screen widgets.

## Repeat the PostgreSQL integration check

Against a disposable seeded database:

```sh
DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/TEST_DB' \
  node --import tsx scripts/verify-postgres.ts
```

The script inserts only records owned by a randomly generated verification principal, checks them, then removes those records. It does not drop tables or erase existing application records.


## Answer-mode update

The richer-answer mode update passed strict TypeScript, the production build, 58 unit/contract tests, and 15 browser scenarios (the existing suite plus focused consent/routing and offline-reference checks). New coverage verifies guided reference journeys, no network calls in guided mode, explicit cloud consent before sending, local/cloud route selection, secret-free configuration status, an explicit Ollama model-list probe, unavailable-provider errors, and open-ended citation retrieval without a theme-keyword requirement. Live model quality and API.Bible entitlement still require operator-provided services/credentials.


## Mobile Practice and optional PIN screen lock

The latest local verification passed strict TypeScript, the production build, 71 unit/contract tests, and all 17 Chrome browser scenarios. New scenarios exercise a 390px Practice response, edited text saved during completion, reload persistence, PIN setup, personal-screen gating after reload, wrong-PIN rejection, successful unlock, and public WEB reading without revealing journal text. Automated light/dark accessibility checks passed. Existing AWP contract, offline, citation, mode-routing, and prayer scenarios remain passing.

The PIN is explicitly a browser display gate, not encryption or API/server authentication. Its documented limits are part of the delivered feature. Physical iOS keyboard behavior and biometric authentication were not tested; viewport-aware chat positioning and larger mobile controls are implemented. Live model/translation quality still depends on configured services and credentials.

## Verification — 2026-11-11

Re-checked on macOS after per-device onboarding and the focused regression suite. Commands (no live model, API.Bible, or paid cloud keys required for default runs):

```sh
npm run typecheck
npm test
npm run build
npm run test:sanity   # production server on 127.0.0.1:3100, mocked TTS/models
npm run test:e2e      # full Playwright suite when changing flows
```

| Check | Observed result |
|---|---|
| Strict TypeScript | `npm run typecheck` passed. |
| Unit / service contracts | `npm test`: **116 passed** across **17** files (includes onboarding starters, `deviceProfile` migration, Kokoro/tts/chunks, verse images, Ollama Access). |
| Production build | `npm run build` passed. |
| Focused regression (`test:sanity`) | **7** Playwright scenarios: returning-user mobile journey (offline, layout/snapshot, Scripture/TTS fidelity, voice routing, cloud/Ollama modes, PIN) plus AWP discovery and advertised error contracts. See [TESTING.md](TESTING.md). |
| Full browser end-to-end | **51** Playwright tests across **8** specs, including **5** clean-device onboarding cases (`onboarding.spec.ts`). |
| Device welcome | No `/api/` traffic on first-run starters; offline reference journey; Start fresh retains journal/PIN; Customize dismisses without creating a plan. |

### Covered since 2026-11-10

- Per-device welcome and local WEB starter journeys (5d mobile/tablet, 7d desktop).
- IndexedDB + write-ahead recovery for `deviceProfile` and `journeyOnboarding`.
- Focused whole-app checks with frozen clock, returning-user fixture, and macOS Chrome dark Today baseline (`tests/e2e/journey-sanity.spec.ts-snapshots/`).
- Single-shot AWP HTTP error envelope verification for every declared action (`awp-sanity.spec.ts`).

### Still operator-dependent

- Live Ollama on Vercel after tunnel + Access env vars (tunnel steps in [OLLAMA-TUNNEL.md](OLLAMA-TUNNEL.md) remain incomplete on the operator machine).
- `TEST_REAL_TTS=1` optional Kokoro cold-start run (`audio-runtime.spec.ts`).
- Linux/Windows CI must review its own screenshot baseline; see [TESTING.md](TESTING.md).
