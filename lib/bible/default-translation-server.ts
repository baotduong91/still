import type { z } from "zod";
import type { TranslationId } from "@/lib/schemas";
import { Translation } from "@/lib/schemas";
import { apiBibleTranslationIds } from "./default-translation";

function apiBibleId(id: TranslationId) {
  return id === "CSB"
    ? process.env.API_BIBLE_CSB_ID
    : id === "NLT"
      ? process.env.API_BIBLE_NLT_ID
      : id === "MSG"
        ? process.env.API_BIBLE_MSG_ID
        : undefined;
}

function apiBibleEnabled(id: TranslationId) {
  return !!(
    apiBibleId(id) &&
    process.env.API_BIBLE_KEY &&
    process.env.API_BIBLE_NONCOMMERCIAL === "true"
  );
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

export function withServerTranslationDefault(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  const input = raw as { translation?: TranslationId };
  if (input.translation !== undefined) return raw;
  return { ...input, translation: serverDefaultTranslation() };
}

export function parseWithServerTranslationDefault<S extends z.ZodTypeAny>(
  schema: S,
  raw: unknown,
): z.infer<S> {
  return schema.parse(withServerTranslationDefault(raw));
}
