import { beforeEach, afterEach, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({
  saved: undefined as unknown,
  put: vi.fn(),
}));
vi.mock("idb", () => ({
  openDB: async () => ({ get: async () => fixture.saved, put: fixture.put }),
}));
let local: Map<string, string>;
beforeEach(() => {
  vi.resetModules();
  fixture.saved = undefined;
  fixture.put.mockReset();
  local = new Map();
  vi.stubGlobal("indexedDB", {});
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => local.get(key) ?? null,
    setItem: (key: string, value: string) => local.set(key, value),
    removeItem: (key: string) => local.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());
it("reads a legacy record with new defaults without replacing saved settings", async () => {
  fixture.saved = {
    plans: [{ id: "saved-plan" }],
    activeId: "saved-plan",
    theme: "dark",
    setupSeen: true,
  };
  const { readState } = await import("@/lib/client/store");
  const saved = await readState();
  expect(saved.activeId).toBe("saved-plan");
  expect(saved.plans).toEqual([{ id: "saved-plan" }]);
  expect(saved.theme).toBe("dark");
  expect(saved.journeyOnboarding).toEqual({});
  expect(saved.deviceProfile).toBeUndefined();
  expect(saved.cloudConsent).toBe(false);
});
it("restores onboarding and the same anonymous identity from the write-ahead record", async () => {
  const profile = {
    id: crypto.randomUUID(),
    createdAt: "2026-11-11T00:00:00.000Z",
    formFactor: "mobile",
    starterIntent: "grief",
    starterVariant: 2,
  };
  local.set(
    "still-pending-save",
    JSON.stringify({
      deviceProfile: profile,
      journeyOnboarding: { completedAt: "2026-11-11T00:01:00.000Z" },
      activeId: "local-plan",
    }),
  );
  const { readState } = await import("@/lib/client/store");
  const saved = await readState();
  expect(saved.deviceProfile).toEqual(profile);
  expect(saved.journeyOnboarding?.completedAt).toBeTruthy();
  expect(saved.activeId).toBe("local-plan");
  expect(fixture.put).toHaveBeenCalledWith("state", saved, "current");
  expect(local.has("still-pending-save")).toBe(false);
});
