import type { SavedState } from "./store";

export type ModesStatus = {
  modes: {
    cloud: { configured: boolean; vendor?: "groq" | "gateway" };
  };
};

export function hostedGroqAvailable(status: ModesStatus) {
  return (
    status.modes.cloud.configured && status.modes.cloud.vendor === "groq"
  );
}

export function shouldApplyHostedGroqDefault(state: SavedState) {
  return (
    !state.guidePreferenceSet &&
    state.provider === "curated" &&
    !state.cloudConsent
  );
}

export function hostedGroqDefaultState(state: SavedState): SavedState {
  return {
    ...state,
    provider: "cloud",
    cloudConsent: true,
    guidePreferenceSet: true,
  };
}
