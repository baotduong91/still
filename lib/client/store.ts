import { openDB } from "idb";
import {
  cloudConsentHeader,
  cloudStatusHeader,
  cloudFallbackHeader,
  isCloudStatus,
} from "@/lib/ai/cloud-status";
import { recordCloudStatus } from "./cloud-status";
import type { PlanType, JournalType, TranslationId } from "@/lib/schemas";
export type DeviceProfile = {
  id: string;
  createdAt: string;
  formFactor: "mobile" | "tablet" | "desktop";
  starterIntent?: string;
  starterVariant?: number;
};
export type SavedState = {
  deviceProfile?: DeviceProfile;
  journeyOnboarding?: { completedAt?: string; dismissedWelcome?: boolean };
  speechEngine: "auto" | "edge" | "kokoro" | "device";
  pinLock: { salt: string; hash: string; iterations: number } | null;
  setupSeen: boolean;
  plans: PlanType[];
  activeId: string | null;
  translation: TranslationId;
  theme: "light" | "dark" | "system";
  provider: "curated" | "ollama" | "cloud";
  journals: JournalType[];
  highlights: Record<string, string>;
  notes: Record<string, string>;
  cloudConsent: boolean;
  guidePreferenceSet?: boolean;
  translationPreferenceSet?: boolean;
  onlineScripture: boolean;
  remoteIds: string[];
  outbox: { path: string; body: unknown }[];
};
export const defaults: SavedState = {
  journeyOnboarding: {},
  speechEngine: "auto",
  pinLock: null,
  setupSeen: false,
  plans: [],
  activeId: null,
  translation: "WEB",
  theme: "system",
  provider: "curated",
  journals: [],
  highlights: {},
  notes: {},
  cloudConsent: false,
  onlineScripture: false,
  remoteIds: [],
  outbox: [],
};
const databasePromise =
  typeof indexedDB !== "undefined"
    ? openDB("still-private", 1, {
        upgrade(db) {
          db.createObjectStore("state");
        },
      })
    : null;
const database = () => {
  if (!databasePromise) throw new Error("Browser storage is unavailable.");
  return databasePromise;
};
export function mergeSavedState(saved?: Partial<SavedState>): SavedState {
  return {
    ...defaults,
    ...saved,
    journeyOnboarding: {
      ...defaults.journeyOnboarding,
      ...saved?.journeyOnboarding,
    },
  };
}
export async function readState(): Promise<SavedState> {
  const pending = localStorage.getItem("still-pending-save");
  if (pending) {
    const restored = mergeSavedState(JSON.parse(pending));
    await (await database()).put("state", restored, "current");
    if (localStorage.getItem("still-pending-save") === pending)
      localStorage.removeItem("still-pending-save");
    return restored;
  }
  return mergeSavedState(await (await database()).get("state", "current"));
}
let writing = Promise.resolve();
export function writeState(state: SavedState) {
  const snapshot = structuredClone(state);
  const serialized = JSON.stringify(snapshot);
  // A synchronous write-ahead record survives reload while an IndexedDB transaction is pending.
  localStorage.setItem("still-pending-save", serialized);
  writing = writing
    .catch(() => {})
    .then(async () => {
      await (await database()).put("state", snapshot, "current");
      if (localStorage.getItem("still-pending-save") === serialized)
        localStorage.removeItem("still-pending-save");
    });
  return writing;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
  ) {
    super(message);
  }
}
export function recoverable(error: unknown) {
  return (
    error instanceof TypeError ||
    (error instanceof ApiError &&
      [401, 404, 500, 502, 503, 504].includes(error.status))
  );
}
export async function api<T>(
  path: string,
  body?: unknown,
  options: { cloudConsent?: boolean } = {},
): Promise<T> {
  const cloud =
    body &&
    typeof body === "object" &&
    "provider" in body &&
    body.provider === "cloud";
  if (cloud && !options.cloudConsent)
    throw new Error(
      "Enable cloud sharing in Settings before sending a personal prompt.",
    );
  const response = await fetch(
    `/api/awp/${path}`,
    body
      ? {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(cloud ? { [cloudConsentHeader]: "true" } : {}),
          },
          body: JSON.stringify(body),
        }
      : {},
  );
  const status = response.headers.get(cloudStatusHeader);
  if (isCloudStatus(status))
    recordCloudStatus(
      status,
      response.headers.get(cloudFallbackHeader) === "guided",
    );
  const data = await response.json();
  if (!response.ok)
    throw new ApiError(
      data.error?.message ?? "Request failed",
      data.error?.code ?? "UNKNOWN",
      response.status,
    );
  return data;
}
