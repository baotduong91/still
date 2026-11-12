# Still: setup and operations

For the complete offline / Mac Ollama / hosted cloud / online CSB mode table and explicit opt-in steps, see [MODES.md](MODES.md).

## Start locally

Requires Node.js 22.12+ (Node 24 recommended) and npm. No account, model server, or database is required for personal use.

```sh
npm ci
cp .env.example .env
npm run db:generate
npm run dev
```

Open http://127.0.0.1:3000. The initial journey opens on Day 1. The app binds to loopback by default. For production PWA testing:

```sh
npm run build
npm run start
```

Use Settings → Download for offline, then install the PWA. On iOS Safari: Share → Add to Home Screen. HTTPS is required outside localhost. A PWA can provide home-screen shortcuts and downloadable verse wallpaper; it cannot install native iOS lock-screen widgets. Audio uses available browser/OS speech synthesis voices, not a prerecorded Bible. Some voices require connectivity.

## Architecture and storage

Next.js App Router/strict TypeScript renders the human surface. Both browser actions and AWP call the same service layer. `lib/ai/orchestrator.ts` and `lib/bible/index.ts` are pure shared modules; offline curated generation and lookup use the same implementation as the server. AI SDK powers optional cloud structured output; Ollama uses its local JSON-schema API.

Scripture: complete public-domain WEB corpus (66 books, 31,103 source records) lives in `public/bibles/WEB.json`. `data/provenance.json` records source URL, archive/corpus SHA-256, and the verbatim VPL parsing transform. No remote Bible API is required. Public-domain source: https://ebible.org/Scriptures/engwebp_vpl.zip. Copyright statement: https://ebible.org/Scriptures/copyright.php. The included WEB edition uses its publisher’s versification; chapter lookup returns actual stored records. Missing explicit verses fail, never silently substitute.

Local server: atomic JSON files under DATA_DIR, signed HttpOnly anonymous browser sessions, separate agent bearer principal. Use only one Node server process in file mode. Files are mode 0600 in a mode 0700 directory. The generated session signing secret is retained in that directory. Back up the entire directory privately.

Browser: a short-lived localStorage write-ahead record protects saves interrupted by a reload; IndexedDB holds complete saved plans, journal entries, preferences, notes, and highlights. The service worker caches public app screens, static assets, and WEB; it never caches private API responses. Browser storage is not encrypted and can be evicted. Export your data before clearing it. The JSON backup is a portable export; there is no automatic import UI.

Offline completion/journal writes are queued and replayed after reconnecting. Offline-created plans and offline adaptations remain local. Cross-device sync is intentionally absent; online plans/journals also persist on the local server for the originating principal. Clearing cookies creates a new server principal. A bearer agent’s plans are separate from browser plans. No implicit sharing between the two.

A journey advances to its first incomplete day, so calendar gaps never skip unread material. Completion dates come from the device’s local calendar; the gentle counter is distinct days of participation, not a punitive consecutive streak.

## PostgreSQL + Prisma

```sh
export POSTGRES_PASSWORD='choose-a-local-password'
docker compose up -d
# Set DATABASE_URL in .env to match the database above.
npm run db:migrate
npm run db:seed
```

The project includes an initial Prisma migration. `db:migrate` applies committed migrations. For later schema changes, generate and review a new migration with `npx prisma migrate dev --name your_change`, then use `npm run db:migrate` during releases. `db:push` is also available for disposable development databases; do not use it against established data without reviewing the changes.

The schema contains Plan, Journal, Scripture, and RateLimit. PostgreSQL uses owner-scoped records, optimistic plan revisions, and shared rate-limit counters. Scripture is read from the local PostgreSQL corpus when seeded, otherwise from local JSON. Seed replacement is transactional and contains no synthesized text. Explicitly imported translations can be seeded with `SEED_TRANSLATION=CSB npm run db:seed`.

Use PostgreSQL rather than local files for multiple workers. Configure a stable SESSION_SECRET across instances. Supply a persistent DATA_DIR or SESSION_SECRET so a redeploy does not invalidate browser sessions. Set SITE_URL to the exact externally visible origin behind a reverse proxy.

## Translation licensing: WEB default, optional online editions

WEB is the default and offline validation corpus. Optional CSB/NLT online access and its licensing/caching boundaries are documented in [API-BIBLE.md](API-BIBLE.md). Existing explicitly selected preferences are preserved. Saved plans retain WEB; online displays can retrieve the selected edition with attribution.


Obtain a licensed, authorized corpus from the rights holder before importing CSB/NLT/NIV/ESV. A general ability to quote brief excerpts is not a license to bundle a whole translation. The loader cannot grant a license or verify your legal entitlement. This implementation serves imported corpus files to its readers; your license must permit local storage, browser/offline delivery, and artwork export for your intended deployment. If your license is API-only or forbids offline redistribution, do not use this file loader for that corpus.

Normalize an authorized export into this schema without changing verse text:

```json
{
  "translation": "CSB",
  "name": "Christian Standard Bible",
  "source": "Your licensed supplier and edition",
  "license": "Your grant and applicable restrictions",
  "offlineAllowed": true,
  "verses": [
    { "book": "John", "chapter": 3, "verse": 16, "text": "EXACT LICENSED TEXT FROM YOUR SUPPLIER" }
  ]
}
```

The text above is a format placeholder, not a valid production corpus. Supply the real complete authorized text. Canonical book names match `WEB.json`, including Psalms and Song of Solomon. Duplicate coordinates or unknown books fail import. Partial imports are possible for testing, but missing references fail rather than mixing translations within a passage.

```sh
CONFIRM_LICENSE=yes npm run bible:import -- /absolute/path/authorized-CSB.json
SEED_TRANSLATION=CSB npm run db:seed # if using PostgreSQL
# Restart the app to invalidate the in-process corpus cache.
```

Imported copyrighted files are gitignored. WEB offline download is enabled by default; licensed corpus requests are deliberately not added to the public service-worker cache. Existing saved passages still reside in IndexedDB; use only licenses that allow this.

## Optional local Mac model

Install Ollama following https://docs.ollama.com/quickstart. Use `ollama list` to inspect installed models and choose an instruction-following model that supports structured JSON output and fits your Mac’s memory. A smaller model is faster; test its output quality before relying on it.

1. Pull a suitable model from the current Ollama library with `ollama pull <model-tag>`.
2. Start Ollama, usually `ollama serve` (the desktop app may already run it).
3. Set OLLAMA_BASE_URL=http://127.0.0.1:11434 and OLLAMA_MODEL to that exact installed tag in `.env`.
4. Restart Next.js; choose Local Mac · Ollama in Settings.
5. Generate a plan or ask a thematic Bible question.

The browser never talks directly to Ollama. The Node server must be on the Mac or able to reach its configured Ollama endpoint. Do not expose Ollama to the public Internet. A model timeout, malformed JSON, or unavailable model returns LOCAL_MODEL_UNAVAILABLE; no cloud call is made.

## Optional Groq cloud: one key

Create a key at [Groq Console](https://console.groq.com/keys), add `GROQ_API_KEY` to Vercel Production environment variables (or local `.env.local`), redeploy/restart, and choose **Cloud · Groq** plus the sharing checkbox in Settings. No other model variable or account is needed. Rate limits/unreachable Groq return labelled guided WEB content. See [GROQ.md](GROQ.md) for setup, free-tier limits, status checks, streaming, and privacy details.

## Alternative OpenAI, Gemini, or Anthropic cloud model

When `GROQ_API_KEY` is absent, the existing cloud interface uses Vercel AI Gateway with the installed AI SDK. It supports provider/model IDs for OpenAI, Google Gemini, and Anthropic. Create an AI Gateway key using its official documentation: https://vercel.com/docs/ai-gateway. Fetch current model IDs with:

```sh
curl https://ai-gateway.vercel.sh/v1/models
```

Set AI_GATEWAY_API_KEY and CLOUD_MODEL to a valid returned `provider/model` identifier in `.env`; restart the server. Choose Optional cloud model in Settings. No keys are ever accepted in the browser UI or placed in NEXT_PUBLIC variables. This is a gateway integration, not direct provider billing/BYOK configuration.

The selected provider receives the goal, the retrieved passages, and relevant recent chat context. Journals are not automatically sent. Cloud calls are opt-in, have a 90-second timeout, and never occur on local model failure. Model integration is schema-validated and covered with mocks; live cloud credentials are not included.

## Fidelity and personalization pipeline

1. Extract supported themes from explicitly stated goals; retain the user’s wording without inventing biographical details.
2. Select a progressive outline from the reviewed theme curriculum, interleaving multiple themes when requested and selecting relevant context lessons for explicitly mentioned sleep, work, family, or conflict.
3. Retrieve canonical passages from local Scripture, honoring the requested translation and labeling fallback.
4. Create title, objective, context, explanation, reflection, connection, two questions, prayer, action, journal prompt, and next-day bridge. Optional model calls receive this constrained outline and exact passages, and can enrich commentary only.
5. Validate schema, day numbering, nonrepeating titles, minimum content, and every exact passage/verse record. Reject model commentary containing quotation marks or reference-shaped citations; citations are separately rendered from retrieval.
6. Persist on the server and save the complete returned plan in IndexedDB.

The no-key guide is intentionally labeled curated, not a live language model. It handles eight themes and combinations: anxiety, grief, forgiveness, prayer, patience, decisions, healing, gratitude. Arbitrary unrelated goals receive a recoverable request for a clearer theme. Its chat gives reviewed thematic starting points and exact citations, or abstains when unsupported. It does not pretend to answer every theological question. Different themes and contextual combinations produce different passages, objectives, practices, and progression; wording-only changes within an identical goal profile can share a curriculum.

Exact quotation validation is mechanical. Theological correctness of generated prose is not mechanically provable; model prose is labeled interpretation, constrained to retrieved passages, and may require human discernment. Conservative notes flag tradition differences and avoid guarantees of health, reconciliation, or personal outcomes.

## Verify

```sh
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Playwright uses installed Google Chrome (`channel: chrome`) on this Mac. On CI, install it with `npx playwright install --with-deps chrome`, or switch the project to bundled Chromium and install that browser. E2E uses port 3100 and a production build, including real service-worker/offline navigation. See `docs/VERIFICATION.md` for observed results and remaining limits.

## Deploy deliberately

This deliverable is a runnable source project; it has not been publicly deployed. Use a Node-compatible Next.js host, HTTPS, PostgreSQL, a stable session secret, correct SITE_URL, appropriate backups, and upstream abuse controls. Anonymous personal instances allow visitors to create their own isolated sessions; they are not a public multi-user SaaS with signup, account recovery, or an admin interface. The 120/minute per-principal limiter is functional but is not a substitute for edge limits against anonymous session churn. No analytics/tracking SDKs are included. Next telemetry is disabled in provided dev/build scripts.
