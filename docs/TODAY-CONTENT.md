# Sparse Today content

Today keeps four modules: exact anchor → reflection → prayer/contemplation →
one small practice. The existing AWP `Plan`/`Day` fields remain compatible.

`lib/ai/today-content.ts` exports the reusable `todayBlueprint`,
`todayContentInstruction`, `todayDevotionalDay` Zod schema, `todayTemperature`,
and `todayTokenBudget`. Groq receives the policy as its system instruction and
one supplied editorial lens per day. Its response schema has **no source-text
field** and rejects extra fields. The application attaches independently
retrieved passages after validating every reference against installed WEB.

## Content contract

- Reflection: 60–80 words, a single human tension, two short paragraphs requested;
  no paragraph may exceed three sentences. The word count and paragraph ceiling
  are deterministic gates, including during repair.
- Prayer: first-person, addressed to God or Father, 20–45 words requested.
  Respond to the passage with worship, confession, thanksgiving, petition, or
  surrender. Generic themes default to Christian devotion. Only an explicitly
  secular request uses non-devotional contemplation.
- Practice: one accessible, concrete micro-habit, roughly one or two minutes,
  with 15–35 words requested. No special equipment or presumed household is needed.
- Questions remain optional prompts in the existing two-question field.
  Interpretation is labeled separately from the anchor.
- Stock phrases such as “Let's dive in” and “In today's fast-paced world” fail
  validation. Quotes and reference-shaped strings remain prohibited in model prose.

A no-key guided **contemplation** path also recognizes mindfulness, stillness,
meaning, Stoic and existential entry words. Its anchors are retrieved WEB, not
model-created philosophical quotes.

## Christian devotional direction

Groq blends the original careful Christian devotional voice with sparse prose:
warm, personal, attentive to the user's goal, and grounded only in supplied Scripture.
Trust in Christ and response to God remain, without a denominational formula or a
requirement to turn every day into a doctrinal lesson. Reflections stay 60–80 words
in two short paragraphs; prayers stay 20–45 words. Observation, meaning, and
response should flow naturally rather than sound like a checklist.

Each reflection observes a specific detail in its supplied passage, explains its
meaning cautiously, then invites a concrete response to God. Seven reading lenses
rotate through knowing God, grace/trust, repentance, obedience, prayer/worship,
love of neighbor, and perseverance. The passage takes priority over the lens;
not every text is forced into every theme. The prayer responds to that day's
passage instead of merely asking for calm. Short prose and gentle pacing remain.

No invented historical context, original-language explanations, private revelations,
or promises of healing or success. Descriptive events and promises to specific
audiences must not become blanket personal guarantees. Christ is central to the
journey without inventing a Christological interpretation of every verse. The
model must distinguish interpretation from source text. These are generation
instructions, not an automated proof of theological correctness.

Default guided fallback uses Christian observation/prayer exercises rather than
pretending to supply passage-specific exegesis. The original contemplative lenses
remain available only for explicitly secular requests. Existing saved plans are
not rewritten; generate a new plan to use this direction.

WEB remains the verified primary-text registry. This update does not invent a
cross-tradition quotation corpus. Additional primary wisdom sources must have a
verified exact text, precise citation and usable license before being registered;
the LLM must never fill that registry from memory. The deterministic guarantee
covers retrieved source text and citation identity. Generated commentary is an
interpretation, not an authoritative factual source.

## Generation, limits and fallback

A seven-day Groq journey still uses outline → retrieve/verify → batches 1–3,
4–6, 7 → final plan validation. The outline prefers 1–3 verses and permits at
most eight. Only exact retrieved WEB text is supplied to each prose batch,
once per passage. Temperature is **0.45**. Default output budgets are bounded:
`min(4000, 700 + days × 280)` for an outline and
`min(8000, 600 + batchDays × 700)` for prose (a normal three-day batch: 2700).
A truncated repair gets 1.4× headroom, capped at 5000 output tokens.
The SDK's `maxOutputTokens` maps to Groq's `max_tokens`.

One repair is allowed for the affected outline/batch. Exhausted Groq repairs,
unreachable service, or a rate limit return the bundled original guided copy in
`today-content.ts` with exact local WEB anchors. This copy is schema-checked and
covered across all fourteen day variants in tests. The plan provider is
`curated`, the API reports `X-Still-Fallback: guided`, and Today shows the guided
notice. It never claims that a fallback was generated by Groq or sends the
prompt to another provider. Cancellation still aborts rather than substituting
a plan. Gateway/Ollama keep their existing explicit error behavior.

Existing saved plans are retained; the policy applies to new plans. Personal
feedback stays in `plan.feedback` instead of being appended to narrated
reflections. The original source text is unchanged by adaptation.

## Source and translation boundaries

`Bible.validate` checks local anchors against retrieved WEB byte-for-byte.
`assertPassageText` checks the returned passage aggregate against its exact verse
records before online content reaches the reader and before `verseSpeech`
produces a TTS payload. Licensed citation identity and verse spans are validated
by the API.Bible provider independently of WEB wording. CSB/NLT/MSG are never
validated by comparing their wording to WEB, nor generated by the model.

The reader now keeps requested translation distinct from displayed translation.
The Bible tab shows the selected edition and a quiet loading placeholder from
its first render while online retrieval is pending. It does not briefly paint
WEB verses before switching editions. Exact WEB is shown only after a confirmed
fallback, when offline, or when online Scripture access is off.
It retries a transient initial WEB fallback once, offers an explicit retry,
recovers on reconnect/return to a failed window, and cancels stale requests on
reference changes. Missing access and explicit quota responses are not repeatedly
retried. Offline use preserves the selected edition while displaying exact WEB.
CSB licensing, attribution and the full-corpus license boundary are unchanged.

Settings has a sticky **Back to Today** link for mobile and direct bookmarks.
Reader controls and note inputs are tested at 402 × 874 CSS pixels, including
translation changes, navigation, light/dark mode and Practice persistence.

## Verification

```sh
npm run typecheck
npm test
npm run build
STILL_WEBKIT=1 npm run test:e2e -- translation-startup.spec.ts mobile-navigation.spec.ts journey-sanity.spec.ts groq.spec.ts
```

Groq tests use the real SDK with deterministic mocked HTTP completions; they
assert the policy, token ceiling, temperature, repair, labeled fallback and exact
source attachment without spending a live account's quota. Browser tests include
offline, reconnect, a malformed passage, Settings exit and responsive screenshots.

## Generation interaction

While a journey is being prepared, a native modal blocks changes and navigation
inside the app. The prompt, duration, and edition are disabled, duplicate submits
are ignored, and errors close the modal with the original prompt intact. The
modal does not imply that a draft has been saved before generation succeeds.
