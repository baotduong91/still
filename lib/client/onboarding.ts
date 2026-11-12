import type { DeviceProfile, SavedState } from "./store";
export const welcomeCopy = [
  "A little room for what matters today. Choose a place to begin.",
  "One quiet beginning, at your pace. Choose what meets you here.",
  "A fresh rhythm for this moment. Begin with what is on your heart.",
] as const;
export function starterVariant(id: string) {
  // UUID modulo 3 without rounding a 128-bit integer or measuring the device.
  return [...id.replaceAll("-", "")].reduce(
    (n, digit) => (n * 16 + parseInt(digit, 16)) % 3,
    0,
  );
}
export function createDeviceProfile(
  formFactor: DeviceProfile["formFactor"],
): DeviceProfile {
  const id = crypto.randomUUID();
  return {
    id,
    createdAt: new Date().toISOString(),
    formFactor,
    starterVariant: starterVariant(id),
  };
}
export function measureFormFactor(): DeviceProfile["formFactor"] {
  return window.matchMedia("(max-width: 720px)").matches
    ? "mobile"
    : window.matchMedia("(max-width: 1024px)").matches
      ? "tablet"
      : "desktop";
}
export function needsJourneyWelcome(state: SavedState) {
  return (
    state.plans.length === 0 &&
    !state.activeId &&
    !state.journeyOnboarding?.completedAt
  );
}
