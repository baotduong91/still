import type { SavedState } from "./store";
export function selectedProvider(
  state: Pick<SavedState, "provider" | "cloudConsent">,
) {
  if (state.provider === "cloud" && !state.cloudConsent)
    throw new Error(
      "Enable cloud sharing in Settings before sending a personal prompt.",
    );
  return state.provider;
}
