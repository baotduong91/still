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
import { buildPlan } from "@/lib/ai/orchestrator";
import {
  api,
  defaults,
  readState,
  writeState,
  type SavedState,
} from "@/lib/client/store";
import type { PlanType, TranslationId } from "@/lib/schemas";
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
        const corpus = await getBible(saved.translation);
        if (alive) setBible(corpus);
        if (!saved.plans.length) {
          let plan: PlanType,
            remote = false;
          try {
            ({ plan } = await api<{ plan: PlanType }>("plans/generate", {
              prompt: "I want to find peace when I feel anxious",
              days: 7,
              translation: saved.translation,
            }));
            remote = true;
          } catch {
            plan = buildPlan(
              {
                prompt: "I want to find peace when I feel anxious",
                days: 7,
                translation: saved.translation,
              },
              corpus,
            );
          }
          if (alive)
            await update((s) => ({
              ...s,
              plans: [plan],
              activeId: plan.id,
              remoteIds: remote ? [plan.id] : [],
            }));
        }
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
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    if ("serviceWorker" in navigator)
      navigator.serviceWorker
        .register("/sw.js")
        .catch(() =>
          setError(
            "Offline installation failed. Reading remains available while connected.",
          ),
        );
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
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
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    getBible(state.translation)
      .then((b) => {
        if (alive) setBible(b);
      })
      .catch((e) => setError(e.message));
    return () => {
      alive = false;
    };
  }, [state.translation, ready, getBible]);
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
      } catch {
        if (!cancelled)
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
    update((s) => ({
      ...s,
      plans: [plan, ...s.plans.filter((p) => p.id !== plan.id)],
      activeId: plan.id,
      remoteIds: remote ? [...new Set([...s.remoteIds, plan.id])] : s.remoteIds,
    }));
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
