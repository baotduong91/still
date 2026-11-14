# Groq plan verification

Plan outlines and devotional batches retain exact WEB retrieval/validation before
online CSB/NLT/MSG text is resolved independently. Cloud errors never replace a
requested generated plan with a guided plan.

The November 14 regression rejected complete outlines when Groq supplied more
than three valid theme tags. Themes are ranking metadata: accept supported tags,
deduplicate them and retain the first three when assembling the final plan.
Unknown tags and empty theme lists still fail validation.

Groq receives a strict structural JSON schema with prose/array length guidance
in descriptions. Still independently enforces its full Zod schema after decoding.
A schema repair includes failing field paths, issue codes and numeric bounds;
no prompt, draft, key or retrieved passage is logged. A structured-decoder schema
failure switches that one repair to JSON-object mode, with the same local schema
and Scripture gates. SDK JSON output mode avoids an unsupported-schema warning.

Tests cover five-day CSB and seven-day WEB journeys, extra theme tags, field-level
repair, JSON-format failure recovery, quota waits, consent and exact Scripture.
Browser API mocks disable service workers so WebKit receives deterministic fixture
responses. Offline service-worker behavior is tested separately.
