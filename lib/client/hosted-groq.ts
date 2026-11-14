import { recordCloudVendor } from "./cloud-status";
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

export async function fetchModesStatus(): Promise<ModesStatus | null> {
  try {
    const response = await fetch("/api/modes");
    return response.ok ? ((await response.json()) as ModesStatus) : null;
  } catch {
    return null;
  }
}

/** Hosted Groq does not use the legacy cloud checkbox; consent is implied when cloud is selected. */
export function effectiveCloudConsent(
  state: Pick<SavedState, "provider" | "cloudConsent">,
  status: ModesStatus | null,
): boolean {
  if (state.provider !== "cloud") return state.cloudConsent;
  if (state.cloudConsent) return true;
  return status ? hostedGroqAvailable(status) : false;
}

export function shouldSyncHostedGroqConsent(
  state: SavedState,
  status: ModesStatus,
) {
  return (
    state.provider === "cloud" &&
    !state.cloudConsent &&
    hostedGroqAvailable(status)
  );
}

export function syncHostedGroqConsent(state: SavedState): SavedState {
  return { ...state, cloudConsent: true };
}

type StateUpdate = (fn: (old: SavedState) => SavedState) => Promise<void>;

export async function alignCloudConsentForGroq(
  state: SavedState,
  update: StateUpdate,
): Promise<boolean> {
  const status = await fetchModesStatus();
  if (status?.modes?.cloud?.vendor)
    recordCloudVendor(status.modes.cloud.vendor);
  const consent = effectiveCloudConsent(state, status);
  if (state.provider === "cloud" && !state.cloudConsent && consent) {
    await update(syncHostedGroqConsent);
  }
  return consent;
}
