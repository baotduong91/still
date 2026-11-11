# Still answer modes

| Experience | Runs where | Required configuration | User choice | Scripture |
|---|---|---|---|---|
| Guided study, reference journeys, theme/reference chat | Browser, including offline after download | None | Default | Exact local WEB |
| Open-ended Bible Q&A and generated plans | Node app running on your Mac + Ollama | OLLAMA_MODEL; optional OLLAMA_BASE_URL | Settings → Local Mac · Ollama | Model references must resolve to exact WEB before writing |
| Open-ended hosted answers and plans | Vercel/Node + AI Gateway | AI_GATEWAY_API_KEY + CLOUD_MODEL | Settings → Cloud, then explicit sharing checkbox | Same WEB retrieval and validation gate |
| CSB/NLT wording online | App server + API.Bible | API_BIBLE_KEY, authorized edition IDs, API_BIBLE_NONCOMMERCIAL=true | Online Scripture/reporting toggle + translation selection | Exact API text and attribution; WEB fallback |

Model choice and translation choice are independent. CSB wording does not enable a language model. Choosing Ollama never invokes cloud, even if cloud credentials are configured. Guided study never invokes a model. Settings shows configured modes without sending personal text. Check Ollama connection only queries the local server's model list, and sends no personal prompt. Configuration is not a guarantee that a provider is currently reachable.

## 1. Offline, no keys

```sh
npm ci
cp .env.example .env
npm run db:generate
npm run dev
```

Open http://127.0.0.1:3000. Use Guided study, with a theme such as anxiety, grief, forgiveness, prayer, patience, decisions, healing, or gratitude. In Create a journey use the reference entry point or enter `Study John 3:16`; the first day reads that passage and later guided days examine context and response. Bible chat also accepts a specific reference or theme. This is guided content, not a live model answering arbitrary questions.

For installable offline testing, run `npm run build` then `npm run start`; Settings → Download for offline saves public app screens and the complete WEB Bible. Saved plans, notes, journals, and personal prayers work offline. WEB requires no keys or external Scripture service.

## 2. Open-ended on your Mac

Install Ollama from its official documentation at https://docs.ollama.com/quickstart. Use `ollama list` to identify an installed instruction-following model that supports structured output; pull a suitable model if needed. Start the Ollama desktop app or `ollama serve`.

Set these in `.env` (replace the model placeholder with your exact installed tag):

```dotenv
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=your-installed-model-tag
```

Restart `npm run dev`. Settings → Local Mac · Ollama → Check Ollama connection. The check confirms the configured tag is installed. Submit a Bible question or generate a journey; both use that local model. Each plan performs goal extraction, outline design, exact passage retrieval, composition, and final validation. Chat selects real passages before explaining them. Invalid references or unapproved model quotations fail the gate.

The Next.js server must run on the Mac that can reach Ollama. Opening the Vercel website on your Mac does not move its server onto your Mac: hosted localhost points to Vercel. Settings disables this impossible hosted-loopback configuration. A deliberately configured reachable server endpoint can be used, but do not expose unauthenticated Ollama publicly. Internet connectivity is not necessary for local model inference once the model and dependencies are downloaded; requests still need the local Next.js server and Ollama running. If `.env.local` exists, its values take priority over `.env`; update the intended file consistently.

## 3. Open-ended hosted mode

Set AI_GATEWAY_API_KEY and CLOUD_MODEL in the Vercel project environment. Use a current `provider/model` identifier from the AI Gateway catalog at https://ai-gateway.vercel.sh/v1/models. Redeploy. Set SITE_URL to the exact public origin, keep SESSION_SECRET stable, and use PostgreSQL for durable server-side plans rather than serverless temporary files.

Settings → Cloud model makes the disclosure visible. Check the sharing checkbox before sending any personal prompt. Changing modes clears that consent; a restored old cloud selection cannot silently send. Questions, goals, recent chat context, and retrieved passages go to the chosen cloud model only after this choice. Journals and personal prayers are not automatically included. Keys stay on the server. A failed or unavailable model returns an error rather than selecting another provider. AWP agents express their choice explicitly through the provider input; omitted provider defaults to guided (`curated` for backward compatibility).

## 4. CSB/NLT online wording

Follow [API-BIBLE.md](API-BIBLE.md) for authorized edition IDs, server key configuration, the required non-commercial acknowledgement, caching, attribution, and explicit Scripture-view reporting consent. Starter currently allows 5,000 calls/month and up to three selected licensed Bibles, subject to account availability. WEB remains the offline default and saved-plan validation source. Online API text stays out of offline plan snapshots, service-worker caches, journal exports, and artwork downloads.

CSB is copyrighted by Holman/Lifeway. Its general allowance of up to 1,000 quoted verses has additional conditions and does not authorize embedding a full corpus. A complete locally embedded CSB Bible requires a publisher license; API access follows its own license and caching terms. Nothing here scrapes or invents CSB text. See the primary-source links in API-BIBLE.md.

## Protocol and verification

Both `/agent.json` and `/.well-known/agent.json`, and every existing action endpoint, remain available. `/api/modes` is a UI configuration/status helper, not an additional AWP action. It reports booleans only, never credentials, model IDs, or personal content. Existing clients keep the curated/ollama/cloud provider enum.

Run `npm run typecheck`, `npm test`, `npm run build`, then `npm run test:e2e`. Unit tests cover configuration/routing, consent, exact text, fallback, invalid citations, and model failure with no silent cloud calls. Live cloud/Ollama quality and licensed API access require your configured services; tests use marked fixtures and mocks.


## Mobile writing and optional privacy
Today Practice accepts a typed response and saves it with the day; completion saves the response first. First-run guidance and Settings anchors help find modes, editions, and privacy. Settings → PIN privacy enables an optional browser screen lock on hosted or local instances. Public WEB reading remains available while locked. See [PIN scope and setup](PRIVACY-PIN.md); it is a display gate, not encryption or server/API authentication.
