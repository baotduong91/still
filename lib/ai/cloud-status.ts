export type CloudStatus = "connected" | "rate-limited" | "unavailable";
export type ModelRunOptions = {
  signal?: AbortSignal;
  onCloudStatus?: (status: CloudStatus, fallback?: boolean) => void;
};
export const cloudConsentHeader = "X-Still-Cloud-Consent";
export const cloudStatusHeader = "X-Still-Cloud-Status";
export const cloudFallbackHeader = "X-Still-Fallback";
export const cloudStatusEvent = "still-cloud-status";
export function isCloudStatus(value: unknown): value is CloudStatus {
  return ["connected", "rate-limited", "unavailable"].includes(String(value));
}
