import type { TranslationId } from "@/lib/schemas";

export const apiBibleTranslationIds = [
  "CSB",
  "NLT",
  "MSG",
] as const satisfies readonly TranslationId[];

export function isApiBibleTranslation(
  translation: TranslationId,
): translation is (typeof apiBibleTranslationIds)[number] {
  return (apiBibleTranslationIds as readonly string[]).includes(translation);
}

/** Pick best hosted edition from a list the server reported as available. */
export function defaultTranslationFromAvailable(
  available: Iterable<TranslationId>,
  preferred: TranslationId = "WEB",
): TranslationId {
  const set = new Set(available);
  if (preferred !== "WEB" && set.has(preferred)) return preferred;
  for (const id of apiBibleTranslationIds) {
    if (set.has(id)) return id;
  }
  return "WEB";
}
