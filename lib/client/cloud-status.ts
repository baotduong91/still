import {
  cloudStatusEvent,
  isCloudStatus,
  type CloudStatus,
} from "@/lib/ai/cloud-status";
export type CloudNotice = { status: CloudStatus; fallback: boolean };
const key = "still-cloud-status";
export function recordCloudVendor(vendor: unknown) {
  if (vendor !== "groq" && vendor !== "gateway") return;
  try {
    localStorage.setItem("still-cloud-vendor", vendor);
  } catch {}
}
export function readCloudVendor() {
  try {
    return localStorage.getItem("still-cloud-vendor");
  } catch {
    return null;
  }
}
export function recordCloudStatus(status: CloudStatus, fallback = false) {
  if (typeof window === "undefined") return;
  const notice = { status, fallback };
  try {
    sessionStorage.setItem(key, JSON.stringify(notice));
  } catch {}
  window.dispatchEvent(new CustomEvent(cloudStatusEvent, { detail: notice }));
}
export function readCloudStatus(): CloudNotice | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) ?? "null");
    return isCloudStatus(value?.status)
      ? { status: value.status, fallback: value.fallback === true }
      : null;
  } catch {
    return null;
  }
}
