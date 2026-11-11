# AWP v0.2 implementation

Reference: https://www.agentwebprotocol.org/spec (draft, retrieved 2026-11-10).
The draft requires `/agent.json`; Still serves the identical JSON at that path and `/.well-known/agent.json` as requested. Both return application/json. This is AWP, not an A2A Agent Card or Wildcard agents.json.

The manifest is generated from `lib/awp/actions.ts`. All declared actions execute through `lib/awp/handler.ts`; the human UI uses those same endpoints and business logic. Offline reading uses the same pure Scripture engine against the saved local corpus.

| Action | Method and endpoint | Response |
|---|---|---|
| generate_plan | POST /api/awp/plans/generate | plan |
| get_daily | GET /api/awp/plans/today | day, planId, complete |
| adapt_plan | POST /api/awp/plans/adapt | plan |
| lookup_scripture | GET /api/awp/scripture | passage |
| search_scripture | GET /api/awp/scripture/search | results, total, offset |
| bible_chat | POST /api/awp/chat | answer, citations, context, interpretation, provider, limited |
| create_journal | POST /api/awp/journal | entry |
| get_translations | GET /api/awp/translations | translations, default |
| complete_day | POST /api/awp/plans/complete | plan |
| list_plans | GET /api/awp/plans | plans |
| list_journal | GET /api/awp/journal | entries |

Core AWP fields include version, domain, intent, typed inputs/outputs, per-action auth flags, HTTP routes, execution model, rate limits, and recovery contracts. `input_schema` and `output_schema` are draft-7 JSON Schema extensions with full nested objects, enums, limits, defaults, and required fields. Their definitions come from the same Zod schemas used at runtime; response validation runs before returning success. GET fields are URL query parameters; POST bodies are JSON up to 32 KiB. Unknown input fields are rejected.

## Authentication and privacy

No mandatory accounts. An anonymous browser receives a signed `still_session` HttpOnly, SameSite=Strict cookie; Secure is set for HTTPS origins. Anonymous agents may retain that cookie using a cookie jar. Invalid supplied bearer credentials fail with AUTH_EXPIRED instead of falling through to anonymous access.

Optionally set AWP_TOKEN on the server and send `Authorization: Bearer <token>`. This maps to the `agent-owner` principal, separate from browser sessions. The optional token is a static owner-managed key, not OAuth: refreshing means obtaining/replacing the configured key, not calling an invented refresh endpoint. The manifest does not falsely declare a refresh URL. No API responses containing personal data are publicly cached. Mutation origin checks reject cross-origin browser requests.

Owner scoping is enforced at repository lookup and update. Plan IDs are UUIDs. Adaptation requires the current revision; stale writes fail CONFLICT. Read list_plans and retry with the new revision. Completion is idempotent by plan/day and preserves its first date. Journal creation is idempotent by UUID; repeated IDs return the original entry. Generate is intentionally non-idempotent: if a response is lost, list_plans before retrying. Rate limit is 120 requests per minute per principal (in memory for single-process local mode; PostgreSQL for shared deployments).

## Examples

```sh
# Cookie-jar example; reuse the same jar for all private calls.
curl -c cookies.txt -b cookies.txt http://127.0.0.1:3000/agent.json
curl -c cookies.txt -b cookies.txt   -H 'Content-Type: application/json'   -d '{"prompt":"I am grieving and need room for lament","days":7,"translation":"CSB","provider":"curated"}'   http://127.0.0.1:3000/api/awp/plans/generate

# Use the returned plan.id (do not literally send PLAN_UUID).
curl -b cookies.txt 'http://127.0.0.1:3000/api/awp/plans/today?planId=PLAN_UUID'
curl 'http://127.0.0.1:3000/api/awp/scripture?reference=John%203%3A16&translation=CSB'
curl 'http://127.0.0.1:3000/api/awp/scripture/search?query=grief&offset=0&limit=20'
```

`get_daily` chooses the first incomplete day, or an explicit 1-based `day`. New plans always start at Day 1. It never advances on calendar time alone. `complete=true` when all days are complete. The last day remains readable after completion. `translation` optionally re-retrieves the daily passage in a new selection.

## Recovery contracts

Errors are JSON: `{ "error": { "code": "...", "message": "...", "recovery": "..." } }`.

| Code | HTTP | Recovery |
|---|---|---|
| SCRIPTURE_NOT_FOUND | 404 | Verify reference format and retry lookup_scripture. |
| PLAN_GENERATION_FAILED | 422 | Simplify to a supported theme or switch provider. |
| RATE_LIMITED | 429 | Wait 60 seconds; Retry-After: 60 is supplied. |
| AUTH_EXPIRED | 401 | Refresh the configured bearer credential with its owner, then retry. |
| LOCAL_MODEL_UNAVAILABLE | 503 | Start/retry Ollama, or explicitly choose cloud/curated. |
| PROVIDER_UNAVAILABLE | 503 | Check model credentials or select curated. |
| INVALID_INPUT | 400 | Correct parameters using input_schema. |
| NOT_FOUND | 404 | List this principal’s plans or generate a new plan. |
| CONFLICT | 409 | Reload the current revision before adapting. |
| FORBIDDEN | 403 | Use a same-origin request or authorized bearer credential. |
| INTERNAL_ERROR | 500 | Retry later and inspect configuration. |

No streaming, webhooks, batch actions, OAuth refresh, or other unimplemented transports are advertised. There is no cloud fallback without an explicit provider selection. These contracts are tested by invoking every declared action and validating its actual response against its generated schema.

Default translation is now WEB. Optional fields on Passage are source, attribution, and fumsTokens. HTTP clients displaying API.Bible results must honor that provider’s attribution and usage reporting terms. All declared actions are retained. See API-BIBLE.md.
