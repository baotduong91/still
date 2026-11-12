# Groq: one-key optional cloud

Guided study stays the default. Groq enables open-ended Bible questions and generated journeys only after your explicit Settings choice. No Ollama server, AI Gateway account, or additional model setting is needed.

## Vercel setup

1. Sign up or sign in at [Groq Console](https://console.groq.com/).
2. Open [API Keys](https://console.groq.com/keys), choose **Create API Key**, and copy the key.
3. Open your Vercel project → **Settings → Environment Variables**. Add **GROQ_API_KEY**, paste the key as its value, select **Production**, and save it as a Secret. Add a separate Preview value if desired. Never use a `NEXT_PUBLIC_` prefix.
4. Deploy the updated Still code. Changes to Vercel environment variables require a new deployment.
5. Open Still → **Settings → Your answer mode → Guide → Cloud · Groq**. Check **I choose to send my questions, goals, recent chat context, and retrieved passages to the configured cloud model**.
6. Tap **Check Groq connection**. A successful check shows **Groq connected**. Ask a question in Chat or create a journey.

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

Providing a key does not opt anyone in. Guided and Ollama choices never invoke Groq. Switching modes clears consent. Browser cloud requests include an explicit sharing header, `X-Still-Cloud-Consent: true`; a missing header is rejected before model access. AWP agents retain their existing explicit `provider: "cloud"` opt-in. The provider enum and declared AWP action contracts are unchanged.

Only the submitted goal/question, relevant recent chat context, and retrieved passages are sent. Groq chat includes at most three recent turns. Journals, personal prayers, PIN data, and typed Practice responses are not automatically included. Keys stay on the server. The existing Edge/Bella reading paths are independent.

Plans use the existing staged goal → outline → exact local WEB retrieval → composition → validation pipeline. Models select references and write interpretation, never Scripture fields. Invalid references or quoted model Scripture fail validation. Online translation selection still uses the separate API.Bible layer and retains its licensing and attribution rules.

App chat streams interpretation by complete validated sentence, keeping incomplete/unsafe text private. Exact citations arrive separately from retrieval. Groq's strict structured outputs currently do not support streaming, so plans and AWP JSON chat use structured output; app chat uses plain upstream streaming followed by the same quotation/reference validation gate. The first visible sentence can arrive before generation finishes. Navigating away or locking the personal surface cancels the stream. AWP discovery continues to declare its original non-streaming actions; `/api/chat/stream` is an app-only helper.

Rate limits, network errors, or the 30-second Groq request deadline produce a clearly labelled **guided WEB** response, with a quiet status in Settings and Today/Chat. They never automatically send the prompt to AI Gateway or Ollama, and there are no automatic upstream retries. An unsupported plan goal receives a guided prayer beginning that retains the submitted intention without claiming full personalization. An unsupported chat question may receive the honest guided limitation. Saved days remain available offline. Malformed citations or unsafe commentary are rejected rather than shown. Guided study can also be chosen explicitly at any time.

## Free tier and troubleshooting

The published free-plan limits for `openai/gpt-oss-120b`, checked November 11, 2026, are **30 requests/minute, 1,000 requests/day, 8,000 tokens/minute, and 200,000 tokens/day**, applied at the organization level. Limits may change; your [Groq limits dashboard](https://console.groq.com/settings/limits) is authoritative. A generated plan makes three model requests; open-ended chat may need a separate reference-selection request. Long journeys can exhaust the free token allowance even with a small number of requests. Still caps output, uses short passages, and falls back to guided study on rate limiting.

- **Cloud setup needed:** check the exact variable name, environment scope, and redeploy/restart. No key is entered into the app's Settings.
- **Groq unavailable:** check the key and access to the default model in Groq Console, then retry the metadata-only connection check.
- **Groq rate limited:** wait for your allowance to reset, shorten the next journey, or keep reading the guided response. Repeated requests are unnecessary.
- **Sharing not enabled:** choose Cloud · Groq and check the disclosure. Configuration alone does not authorize sending prompts.

Primary sources: [Groq quickstart](https://console.groq.com/docs/quickstart), [OpenAI compatibility](https://console.groq.com/docs/openai), [default model](https://console.groq.com/docs/model/openai/gpt-oss-120b), [structured output limitations](https://console.groq.com/docs/structured-outputs), [rate limits](https://console.groq.com/docs/rate-limits), [Vercel environment variables](https://vercel.com/docs/environment-variables).

Verification uses the real Groq SDK against mocked HTTP responses, including opt-in, no-key/no-consent isolation, staged plans, exact WEB citations, rate limits, and incremental streaming. It does not spend a real account's quota or certify live availability.
