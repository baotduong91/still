import { openDB } from "idb";
import type { PlanType, JournalType, TranslationId } from "@/lib/schemas";
export type SavedState = {
  plans: PlanType[];
  activeId: string | null;
  translation: TranslationId;
  theme: "light" | "dark" | "system";
  provider: "curated" | "ollama" | "cloud";
  journals: JournalType[];
  highlights: Record<string, string>;
  notes: Record<string, string>;
  remoteIds: string[];
  outbox: { path: string; body: unknown }[];
};
export const defaults: SavedState = {
  plans: [],
  activeId: null,
  translation: "CSB",
  theme: "system",
  provider: "curated",
  journals: [],
  highlights: {},
  notes: {},
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
export async function readState(): Promise<SavedState> {
  const pending = localStorage.getItem("still-pending-save");
  if (pending) {
    const restored = { ...defaults, ...JSON.parse(pending) } as SavedState;
    await (await database()).put("state", restored, "current");
    if (localStorage.getItem("still-pending-save") === pending)
      localStorage.removeItem("still-pending-save");
    return restored;
  }
  return { ...defaults, ...(await (await database()).get("state", "current")) };
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
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(
    `/api/awp/${path}`,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {},
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? "Request failed");
  return data;
}
