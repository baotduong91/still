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
- The app has not been publicly deployed or load-tested. It is designed for a personal instance, not a hardened multi-tenant SaaS.
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
