import type { SavedState } from "./store";
import type { TranslationId } from "@/lib/schemas";
import { defaultTranslationFromAvailable } from "@/lib/bible/default-translation";

export type TranslationsStatus = {
  translations: { id: TranslationId; available: boolean }[];
  default: TranslationId;
};

export function shouldApplyHostedTranslationDefault(state: SavedState) {
  return !state.translationPreferenceSet && state.translation === "WEB";
}

export function hostedTranslationDefaultState(
  state: SavedState,
  status: TranslationsStatus,
): SavedState {
  const available = status.translations
    .filter((t) => t.available)
    .map((t) => t.id);
  const next = available.includes(status.default)
    ? status.default
    : defaultTranslationFromAvailable(available);
  if (next === "WEB" || next === state.translation) return state;
  return { ...state, translation: next };
}
