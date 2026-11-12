# Still — Bible devotional PWA + AWP

A local-first, personal Scripture app with a calm editorial UI, complete WEB Bible, daily rhythms, differentiated study journeys, journaling, cited discussion, offline reading, and an AWP v0.2 agent surface.

**Architecture:** Next.js 16 App Router + strict TypeScript → shared devotional orchestration / exact Scripture validation → PostgreSQL + Prisma or atomic local personal storage. IndexedDB and a service worker keep saved plans and Scripture available offline. Optional Ollama or AI SDK cloud models enrich commentary only; citations remain exact local retrieval.

```sh
npm ci
cp .env.example .env
npm run db:generate
npm run dev
```

Open http://127.0.0.1:3000. See [PIN and mobile privacy](docs/PRIVACY-PIN.md), [Answer modes](docs/MODES.md), [Setup](docs/SETUP.md), [AWP contracts](docs/AWP.md), [verification](docs/VERIFICATION.md), and [complete source tree](docs/FILE_TREE.txt).

- WEB is the offline default. Optional CSB/NLT access uses a server-configured API.Bible key, clear attribution, and explicit online usage-reporting consent. See [API.Bible setup](docs/API-BIBLE.md).
- A private [device welcome](docs/ONBOARDING.md) turns one intent choice into a local WEB starter journey: five days on phones/tablets, seven on desktop, with no account or model call.
- Includes all 66 books and 31,103 exact source records with provenance checksums.
- No-key operation is a transparent curated guide, not a simulated live LLM. Optional providers require explicit configuration and selection.
- UI and machine endpoints share validation and business logic. AWP is served at both `/agent.json` and `/.well-known/agent.json`.
- Sample plans in `data/sample-plans/` demonstrate anxiety at work, grief, and forgiveness with different passages, progressions, and actions.
- No accounts, ads, analytics SDKs, or automatic cloud transmission. Browser and local server storage are unencrypted.

This source is independently designed around the requested product flows and does not use Bible Chat branding or assets. No public deployment has been created. Read the setup document’s deployment and licensing limitations before hosting it for others.
