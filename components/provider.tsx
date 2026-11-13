"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Bible, type Corpus } from "@/lib/bible";
import {
  createDeviceProfile,
  measureFormFactor,
  needsJourneyWelcome,
} from "@/lib/client/onboarding";
import {
  api,
  ApiError,
  defaults,
  readState,
  writeState,
  type SavedState,
} from "@/lib/client/store";
import { recordCloudVendor } from "@/lib/client/cloud-status";
import {
  hostedGroqAvailable,
  hostedGroqDefaultState,
  shouldApplyHostedGroqDefault,
} from "@/lib/client/hosted-groq";
import {
  hostedTranslationDefaultState,
  shouldApplyHostedTranslationDefault,
  type TranslationsStatus,
} from "@/lib/client/hosted-translation";
import type { PlanType, TranslationId } from "@/lib/schemas";
import { warmKokoro } from "@/lib/tts/kokoro-client";
import { offlineModelStored } from "@/lib/tts/model-cache";
type AppContext = {
  state: SavedState;
  update: (fn: (old: SavedState) => SavedState) => Promise<void>;
  bible: Bible | null;
  ready: boolean;
  online: boolean;
  error: string;
  setError: (text: string) => void;
  getBible: (id: TranslationId) => Promise<Bible>;
  savePlan: (p: PlanType, remote?: boolean) => Promise<void>;
};
const Context = createContext<AppContext | null>(null);
export function Provider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState(defaults),
    [bible, setBible] = useState<Bible | null>(null),
    [ready, setReady] = useState(false),
    [online, setOnline] = useState(true),
    [error, setError] = useState("");
  const bibles = useRef(new Map<TranslationId, Bible>());
  const latest = useRef(state);
  const update = useCallback(async (fn: (old: SavedState) => SavedState) => {
    const next = fn(latest.current);
    latest.current = next;
    try {
      await writeState(next);
      if (latest.current === next) setState(next);
    } catch {
      setError(
        "Your browser could not save this change. Export your data before closing.",
      );
      throw new Error("The local save did not finish.");
    }
  }, []);
  const getBible = useCallback(async (id: TranslationId): Promise<Bible> => {
    if (bibles.current.has(id)) return bibles.current.get(id)!;
    if (id !== "WEB") {
      const catalog = (await fetch("/bibles/catalog.json")
        .then((r) => r.json())
        .catch(() => ["WEB"])) as string[];
      if (!catalog.includes(id)) return getBible("WEB");
    }
    const response = await fetch(`/bibles/${id}.json`);
    if (!response.ok) {
      if (id !== "WEB") return getBible("WEB");
      throw new Error(
        "The Bible download is not available yet. Connect once to download it.",
      );
    }
    const corpus = (await response.json()) as Corpus;
    const next = new Bible(corpus);
    bibles.current.set(id, next);
    return next;
  }, []);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const saved = await readState();
        latest.current = saved;
        if (alive) setState(saved);
        const corpus = await getBible(
          needsJourneyWelcome(saved) ? "WEB" : saved.translation,
        );
        if (alive) setBible(corpus);
      } catch (e) {
        if (alive) setError((e as Error).message);
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [getBible, update]);
  useEffect(() => {
    if (!ready || !online) return;
    let alive = true;
    fetch("/api/modes")
      .then((r) => (r.ok ? r.json() : null))
      .then((status) => {
        if (!alive || !status || !hostedGroqAvailable(status)) return;
        recordCloudVendor(status.modes.cloud.vendor);
        void update((s) => {
          if (s.provider === "ollama")
            return hostedGroqDefaultState({ ...s, guidePreferenceSet: false });
          if (!shouldApplyHostedGroqDefault(s)) return s;
          return hostedGroqDefaultState(s);
        }).catch(() => {});
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [ready, online, update]);
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    api<TranslationsStatus>("translations")
      .then((status) => {
        if (!alive) return;
        void update((s) => {
          if (!shouldApplyHostedTranslationDefault(s)) return s;
          return hostedTranslationDefaultState(s, status);
        }).catch(() => {});
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [ready, update]);
  useEffect(() => {
    if (!ready || state.deviceProfile) return;
    let timer: ReturnType<typeof setTimeout>;
    const measure = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void update((s) =>
          s.deviceProfile
            ? s
            : { ...s, deviceProfile: createDeviceProfile(measureFormFactor()) },
        ).catch(() => {});
      }, 120);
    };
    measure();
    window.addEventListener("resize", measure, { passive: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", measure);
    };
  }, [ready, state.deviceProfile, update]);
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    if ("serviceWorker" in navigator) {
      if (process.env.NODE_ENV === "development") {
        // Next development chunks have mutable URLs; a production PWA worker can
        // otherwise replay stale JavaScript and cause spurious ReferenceErrors.
        void navigator.serviceWorker
          .getRegistration("/")
          .then(async (registration) => {
            if (!registration?.active?.scriptURL.endsWith("/sw.js")) return;
            const controlled = !!navigator.serviceWorker.controller;
            if (
              (await registration.unregister()) &&
              controlled &&
              !sessionStorage.getItem("still-dev-worker-cleared")
            ) {
              sessionStorage.setItem("still-dev-worker-cleared", "1");
              window.location.reload();
            }
          })
          .catch(() =>
            setError("Could not clear the old offline worker for development."),
          );
      } else
        navigator.serviceWorker
          .register("/sw.js")
          .catch(() =>
            setError(
              "Offline installation failed. Reading remains available while connected.",
            ),
          );
    }
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  useEffect(() => {
    let alive = true;
    void offlineModelStored()
      .then((stored) => {
        if (alive && stored && navigator.onLine) void warmKokoro();
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () =>
      (document.documentElement.dataset.theme =
        state.theme === "system"
          ? media.matches
            ? "dark"
            : "light"
          : state.theme);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [state.theme]);
  const bibleTranslation = needsJourneyWelcome(state)
    ? "WEB"
    : state.translation;
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    getBible(bibleTranslation)
      .then((b) => {
        if (alive) setBible(b);
      })
      .catch((e) => setError(e.message));
    return () => {
      alive = false;
    };
  }, [bibleTranslation, ready, getBible]);
  useEffect(() => {
    if (!ready || !online || !state.outbox.length) return;
    let cancelled = false;
    (async () => {
      const job = state.outbox[0];
      try {
        const result = await api<{ plan?: PlanType }>(job.path, job.body);
        if (!cancelled)
          await update((s) => ({
            ...s,
            plans: result.plan
              ? s.plans.map((p) =>
                  p.id !== result.plan!.id
                    ? p
                    : {
                        ...p,
                        revision: result.plan!.revision,
                        days: p.days.map((d) => {
                          const synced = result.plan!.days[d.number - 1];
                          return synced.completedAt
                            ? {
                                ...d,
                                completedAt: synced.completedAt,
                                completedDate: synced.completedDate,
                              }
                            : d;
                        }),
                      },
                )
              : s.plans,
            outbox: s.outbox.filter((j) => j !== job),
          }));
      } catch (error) {
        if (cancelled) return;
        const planId = (job.body as { planId?: string }).planId;
        if (
          planId &&
          error instanceof ApiError &&
          [401, 404].includes(error.status)
        ) {
          await update((s) => ({
            ...s,
            remoteIds: s.remoteIds.filter((id) => id !== planId),
            outbox: s.outbox.filter(
              (j) => (j.body as { planId?: string }).planId !== planId,
            ),
          }));
        } else
          setError(
            "An offline change is still waiting to sync. Your local copy is saved.",
          );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [online, ready, state.outbox, update]);
  const savePlan = (plan: PlanType, remote = false) =>
    update((s) => {
      const old = s.plans.find((p) => p.id === plan.id);
      const merged = {
        ...plan,
        days: plan.days.map((d) => ({
          ...d,
          ...(d.practiceResponse === undefined &&
          old?.days[d.number - 1]?.practiceResponse !== undefined
            ? { practiceResponse: old.days[d.number - 1].practiceResponse }
            : {}),
        })),
      };
      return {
        ...s,
        plans: [merged, ...s.plans.filter((p) => p.id !== plan.id)],
        activeId: plan.id,
        remoteIds: remote
          ? [...new Set([...s.remoteIds, plan.id])]
          : s.remoteIds,
      };
    });
  return (
    <Context.Provider
      value={{
        state,
        update,
        bible,
        ready,
        online,
        error,
        setError,
        getBible,
        savePlan,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useApp() {
  const app = useContext(Context);
  if (!app) throw new Error("Missing app provider");
  return app;
}
