# WEB default and optional online editions

WEB is the fully local default and canonical validation corpus. No CSB or NLT corpus is bundled, scraped, or generated. Existing selected preferences are preserved.

## Enable API.Bible

Create an app at https://api.bible. Starter currently supports non-commercial use, 5,000 calls per month, and up to three selected licensed editions. Choose CSB and/or NLT if offered to your account. Copy the exact authorized Bible IDs, checking edition names carefully; a key alone does not authorize every translation.

Set server-only API_BIBLE_KEY, API_BIBLE_CSB_ID and/or API_BIBLE_NLT_ID. Set API_BIBLE_NONCOMMERCIAL=true only after confirming eligibility. Restart/redeploy. Never use NEXT_PUBLIC for the key. In Settings enable optional online Scripture and disclosed usage reporting, then select the edition. Without access or consent, displays remain labeled WEB.

API.Bible requires Scripture-view reporting in web apps. Still uses direct FUMS requests with returned tokens and anonymous device/session identifiers only after explicit opt-in. It loads no tracking SDK, supplies no user ID, and sends no prompts or journals to API.Bible. WEB uses no reporting. Disabling the option stops subsequent requests and reports. Required reporting: https://docs.api.bible/resources/fair-use/.

## Fidelity and bounded caching

References are validated against WEB first. The adapter requests individual organization verse IDs with plain-text output, notes/titles/numbers disabled, then checks returned organization and Bible IDs. Verse strings remain verbatim. WEB validates coordinates; the API is the wording authority for online editions. Copyright attribution accompanies API content. Invalid, unavailable, quota-limited, or incomplete responses fall back visibly to exact WEB.

At most 200 verse responses across keys/editions are cached in server memory for 14 days. Concurrent identical requests are deduplicated. There is no persistent mirror or bulk-download facility. Requests over 40 verses fall back to WEB. Cold starts reduce cache reuse; monitor the provider dashboard because verse-per-call retrieval favors precise validation over minimum call count.

API text is not persisted in plans, IndexedDB, service-worker caches, backups, or exported artwork. Saved plans retain WEB; online Today, reader, and citations can display the selected authorized edition. Offline displays use WEB. Search locates references using WEB keywords/topics; this is not full-text CSB/NLT search. Live licensed access requires your own key and is tested with fixtures here.

## CSB license boundary

CSB belongs to Holman/Lifeway. Its general quotation allowance is up to 1,000 verses, with conditions including no complete Bible book and no more than half the resulting work. That allowance does not authorize full-text embedding or an accumulating corpus. Full local embedding requires a publisher license. API access and caching follow separate API.Bible/edition terms. NLT has its own publisher conditions.

Sources:
- Starter access: https://care.api.bible/article/385-how-to-use-an-express-license
- Attribution, reporting, and caching: https://care.api.bible/article/396-licensing-policies-quick-reference
- Publisher quotation notice: https://csbible.com/wp-content/uploads/2018/03/CSB_Outreach_Bible_3rd_printing.pdf

## Guided and generative modes

Guided study uses reviewed thematic paths and is labeled guided. Explicitly selected cloud or Ollama generation now performs goal extraction, progressive outline design, exact canonical retrieval, devotional writing, and final validation. The model cannot supply Scripture wording. Numbering, passage existence, daily differentiation, and exact text are hard gates. Model commentary stays labeled interpretation. A local model failure never silently invokes cloud.

For theological questions outside guided themes, model chat can select additional real passages before composing an answer. Unsupported questions abstain. Exact quotations remain separate from interpretation.

The Prayer step and Journal now offer a personal prayer writer, saved privately on the device. A seven-day participation panel counts returning without erasing earlier progress after a gap.
