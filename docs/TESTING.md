# Focused regression and integration checks

```sh
npm ci
npm run build
npm run test:sanity
```

`test:sanity` runs seven Playwright scenarios against the production Next server on `127.0.0.1:3100`. An installed Chrome is used by `playwright.config.ts`. If needed, install it with `npx playwright install chrome`. No live model, TTS service, API.Bible entitlement, or model key is needed.

| Scenario | Integration boundaries checked |
| --- | --- |
| Offline journey | All four sections stay mounted in order; Continue stays in one document; typed Practice survives reload/completion; participation and completion date persist; a new reference journey can be built offline without a plan API call. |
| Mobile layout and visual baseline | 390×844 touch viewport; native smooth-scroll samples; headings and player above bottom navigation; primary targets at least 44px; centered controls pass hit testing; horizontal overflow and cumulative layout shift checks; light/dark Axe AA checks; image format/style targets remain usable. |
| Exact Scripture and fallback | The displayed verse and citation and every captured TTS text/reference match raw WEB corpus records for WEB, unavailable CSB, and unavailable NLT. Missing editions are visibly labelled as WEB fallback. No invented licensed text is used. |
| Voice routing/responsiveness | Edge for online Auto Scripture; unresolved Edge does not block Continue/scrolling; Bella for reflection/prayer and offline Scripture; Kokoro and device preferences stay explicit; no overlapping readers; prepared media fixture reaches playing within 1.5s. |
| Model modes | Configured cloud/Ollama plan and chat inputs retain their selected provider; cloud requires consent; deterministic generated prose has independently verified WEB citations; failed plan/chat calls show an error and never retry a different provider. |
| PIN | Today, Journal, Chat, and their sensitive DOM/player are gated; public WEB lookup works while locked; wrong PIN fails and the right PIN restores the saved Practice response. |
| AWP HTTP surface | Both discovery URLs agree; v0.2 action schemas compile; every declared action rejects invalid input with its advertised status/code/recovery/no-store contract; malformed JSON, invalid verse, missing plan, wrong method, cross-site input, and invalid bearer contracts are exercised. |

The returning-user fixture creates a real guided server plan with that browser context’s cookies, preserving real owner-scoped completion and sync tests. `stateOverrides` customizes saved preferences without mocking the app’s IndexedDB hydration. The focused suite freezes Date, locale, timezone, viewport, and device-profile metadata; timers and animation frames still run normally. Exact Scripture assertions read raw JSON records from `public/bibles/WEB.json`, independently of the app’s verse renderer.

Only generative responses, optional translation unavailability, and media engines are mocked in the focused UI suite. It still exercises the real UI, state persistence, routing, retrieval/display selection, audio engine selection, cancellation, PIN gate, and service worker. The 1.5s fixture budget catches UI/routing stalls; it does **not** benchmark real network synthesis, cold WASM compilation, physical iPhone performance, or audio quality. Existing provider/Scripture-gate unit tests and optional real voice tests cover those other boundaries. No test submits private content to a live model or voice provider.

## Visual review

The single committed golden is `tests/e2e/journey-sanity.spec.ts-snapshots/today-dark-mobile-chromium-darwin.png`. It captures the initial dark Today view with the verse, player, and navigation. Geometry, hit testing, smooth scrolling, and contrast checks continue through the later sections in both themes. Screenshot comparison runs normally; it never auto-accepts changes.

For an intentional visual change, generate and **inspect** the new image before committing:

```sh
npm run test:sanity -- --grep "mobile Today" --update-snapshots
npm run test:sanity -- --repeat-each=2
```

Playwright keeps baselines platform-specific because native fonts/rendering differ. The supplied baseline was reviewed on macOS Chrome; a Linux/Windows CI runner needs its own reviewed platform baseline. A Chrome viewport emulates phone dimensions and touch behavior, not iOS Safari or the physical keyboard.

## Full checks

```sh
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Existing unit and contract tests retain all-action success-schema coverage, server-side owner isolation/idempotency/conflicts, translation provider validation, model Scripture gatekeeping, and the exhaustive kind/preference/connectivity routing matrix. The focused suite complements these tests instead of copying every variation into the browser. Existing `onboarding.spec.ts` continues to test clean-device welcome; the sanity suite deliberately uses a returning user.

Optional live-engine verification (public WEB only; downloads Bella assets):

```sh
TEST_REAL_TTS=1 npm run test:e2e -- audio-runtime.spec.ts
```

Playwright failure artifacts include the screenshot, trace, and error context. This suite does not modify production application behavior or require a deployment.


### Safari engine checks

Install with `npx playwright install webkit`, then run
`STILL_WEBKIT=1 npm run test:e2e -- --project=webkit accessibility.spec.ts audio.spec.ts groq.spec.ts translation-startup.spec.ts storage-safari.spec.ts`.
WebKit automation complements, but does not replace, testing the macOS Add to Dock
app. Use separate output directories if running independent test invocations;
prefer one invocation at a time to avoid shared-server/trace interference.
