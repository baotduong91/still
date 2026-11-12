# Groq: one-key optional cloud

On a hosted Still site with `GROQ_API_KEY`, new visitors default to **Custom journeys & chat · Groq** so **Create** can use a personal prompt immediately (for example a 7-day lament). Choose **Guided study only** in Settings to stay offline and keep prompts on the device. No Ollama server or AI Gateway account is required.

## Vercel setup

1. Sign up or sign in at [Groq Console](https://console.groq.com/).
2. Open [API Keys](https://console.groq.com/keys), choose **Create API Key**, and copy the key.
3. Open your Vercel project → **Settings → Environment Variables**. Add **GROQ_API_KEY**, paste the key as its value, select **Production**, and save it as a Secret. Add a separate Preview value if desired. Never use a `NEXT_PUBLIC_` prefix.
4. Deploy the updated Still code. Changes to Vercel environment variables require a new deployment.
5. Open Still → **Create**, type a goal, keep **7 days**, and tap **Begin my journey**. Custom Groq is selected automatically when the server key is present.
6. Optional: **Settings → Your answer mode** to switch to **Guided study only**, or tap **Check Groq connection** (no personal text is sent).

The connection check requests only the model catalog. It sends no personal text and does not select cloud or grant sharing consent. The one required variable is:

```dotenv
GROQ_API_KEY=your-key-here
```

## Local Mac setup

Add the same variable to the repository's gitignored `.env.local`. Preserve any existing local settings; do not overwrite the file. Restart:

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:3000 and make the Settings choices above. A server restart is required after changing a local key. Keep keys out of source control and chat messages.

## Routing, privacy, and fallback

Still uses the AI SDK Groq adapter with the direct OpenAI-compatible base URL `https://api.groq.com/openai/v1` and default model `openai/gpt-oss-120b`. `CLOUD_MODEL` is not required for Groq. If both cloud setups exist, `GROQ_API_KEY` selects Groq; removing it restores the existing `AI_GATEWAY_API_KEY` + `CLOUD_MODEL` path. Gateway keys are not treated as Groq keys.

The existing hosted Groq default and Settings choices are preserved. Selecting **Guided study only** keeps prompts local and clears cloud sharing; selecting **Custom journeys & chat · Groq** enables the disclosed cloud path. Guided and Ollama requests never invoke Groq. Browser cloud requests include the sharing header, `X-Still-Cloud-Consent: true`; a missing header is rejected before model access. AWP agents retain their existing explicit `provider: "cloud"` opt-in. The provider enum and declared AWP action contracts are unchanged.

Only the submitted goal/question, relevant recent chat context, and retrieved passages are sent. Groq chat includes at most three recent turns. Journals, personal prayers, PIN data, and typed Practice responses are not automatically included. Keys stay on the server. The existing Edge/Bella reading paths are independent.

Groq plans combine goal extraction and a complete progressive outline, retrieve and verify every reference against local WEB, then compose at most three days at a time. A seven-day plan normally makes four requests: outline, days 1–3, days 4–6, and day 7. Each batch sees the complete progression and earlier practices, while receiving its Scripture text only once. Custom journeys are built directly from the verified outline, rather than first validating a potentially unrelated curated seed. Reflection length constraints match the final validation gate. All seven days must pass before the plan is saved as Groq-generated.

Models select references and write interpretation, never Scripture fields. Invalid references, quoted model Scripture, wrong day numbers, and repeated practices fail verification. One repair is allowed for the failed outline or batch, including generation/JSON/schema failures; previously verified batches are retained. A truncated repair gets extra output headroom for GPT-OSS reasoning. Online translation selection still uses the separate API.Bible layer and retains its licensing and attribution rules.

App chat streams interpretation by complete validated sentence, keeping incomplete/unsafe text private. Exact citations arrive separately from retrieval. Groq's strict structured outputs currently do not support streaming, so plans and AWP JSON chat use structured output; app chat uses plain upstream streaming followed by the same quotation/reference validation gate. The first visible sentence can arrive before generation finishes. Navigating away or locking the personal surface cancels the stream. AWP discovery continues to declare its original non-streaming actions; `/api/chat/stream` is an app-only helper.

Plan requests allow up to 90 seconds per model call, within a 240-second provider deadline (the AWP route allows 300 seconds). Plans have a total allowance of two transient retries: network/5xx failures wait one second; 429 responses are retried only when `Retry-After` specifies at most 60 seconds and the deadline permits it. Daily/long quota waits return guided content immediately. Chat retains its 45-second call timeout without automatic transport retries. Cancellation stops work without generating another plan.

Exhausted retries, quota limits, and failed verification produce a clearly labelled **guided WEB** response, with a quiet status in Settings and Today/Chat. They never automatically send the prompt to AI Gateway or Ollama. An unsupported fallback plan goal receives a guided prayer beginning that retains the submitted intention without claiming full personalization. An unsupported chat question may receive the honest guided limitation. Saved days remain available offline. Malformed citations or unsafe commentary are rejected rather than shown. Guided study can also be chosen explicitly at any time.

Operational logs include stage, attempt, failure category, HTTP status, wait time, and token counts only. Prompts, generated prose, Scripture text, keys, and raw provider errors are not logged. These categories distinguish truncation/schema repairs from an upstream outage without recording personal content.

## Free tier and troubleshooting

The published free-plan limits for `openai/gpt-oss-120b`, checked November 11, 2026, are **30 requests/minute, 1,000 requests/day, 8,000 tokens/minute, and 200,000 tokens/day**, applied at the organization level. Limits may change; your [Groq limits dashboard](https://console.groq.com/settings/limits) is authoritative. A generated plan normally makes `1 + ceil(days / 3)` requests; repairs can add requests. Open-ended chat may need a separate reference-selection request. Long journeys can exhaust the free token allowance even with a small number of requests. Still caps output, uses short passages, and handles short token-window resets before falling back.

- **Cloud setup needed:** check the exact variable name, environment scope, and redeploy/restart. No key is entered into the app's Settings.
- **Groq unavailable:** check the key and access to the default model in Groq Console, then retry the metadata-only connection check.
- **Groq rate limited:** wait for your allowance to reset, shorten the next journey, or keep reading the guided response. Repeated requests are unnecessary.
- **Sharing not enabled:** choose Cloud · Groq and check the disclosure. Configuration alone does not authorize sending prompts.

Primary sources: [Groq quickstart](https://console.groq.com/docs/quickstart), [OpenAI compatibility](https://console.groq.com/docs/openai), [default model](https://console.groq.com/docs/model/openai/gpt-oss-120b), [structured output limitations](https://console.groq.com/docs/structured-outputs), [rate limits](https://console.groq.com/docs/rate-limits), [Vercel environment variables](https://vercel.com/docs/environment-variables).

Verification uses the real Groq SDK against mocked HTTP responses, including opt-in, no-key/no-consent isolation, staged plans, exact WEB citations, rate limits, and incremental streaming. It does not spend a real account's quota or certify live availability.

For an explicit live check of the working tree, provide `GROQ_API_KEY` through your environment and run `node --import tsx scripts/verify-groq-plan.ts`. This spends Groq quota on one synthetic seven-day lament, prints only verification metadata, and saves no plan or journal. It exits unsuccessfully if the result falls back to guided. Keep this separate from deterministic tests.

### Cloud plan verification (November 12 follow-up)

Production logs showed successful Groq outline responses rejected at Scripture
reference lookup on both attempts. Outline requests now include the installed
canonical book names and chapter counts. Repairs identify each failing day,
reference, and lookup problem rather than repeating a generic instruction.
Harmless whitespace around colons and verse-range dashes is normalized before
exact corpus lookup; nonexistent verses and cross-chapter ranges remain rejected.

An explicit cloud plan request no longer silently saves a guided replacement.
It returns a fully validated Groq plan or a retryable error; saved days stay
unchanged. Guided mode remains available by choice. Provider quotas/outages and
model validity cannot be guaranteed, and Scripture verification is never bypassed.
Chat's existing labelled fallback is unchanged.
