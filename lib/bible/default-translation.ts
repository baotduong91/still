import type { TranslationId } from "@/lib/schemas";
import { Translation } from "@/lib/schemas";
import { apiBibleEnabled } from "./api-bible";

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

/** Server default when AWP omits translation or env requests a preferred edition. */
export function serverDefaultTranslation(): TranslationId {
  const env = process.env.DEFAULT_TRANSLATION?.trim();
  if (env) {
    const parsed = Translation.safeParse(env);
    if (parsed.success && apiBibleEnabled(parsed.data)) return parsed.data;
  }
  for (const id of apiBibleTranslationIds) {
    if (apiBibleEnabled(id)) return id;
  }
  return "WEB";
}

export function defaultTranslationFromAvailable(
  available: Iterable<TranslationId>,
): TranslationId {
  const set = new Set(available);
  const preferred = serverDefaultTranslation();
  if (preferred !== "WEB" && set.has(preferred)) return preferred;
  for (const id of apiBibleTranslationIds) {
    if (set.has(id)) return id;
  }
  return "WEB";
}
