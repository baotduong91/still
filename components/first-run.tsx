"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Leaf, ShieldCheck } from "lucide-react";
import { useApp } from "./provider";
import { Button } from "./ui/button";
import { starterIntents, starterPlanFromIntent } from "@/lib/ai/starters";
import {
  createDeviceProfile,
  measureFormFactor,
  starterVariant,
  welcomeCopy,
} from "@/lib/client/onboarding";

export function DeviceWelcome() {
  const { state, update, bible, setError } = useApp();
  const router = useRouter();
  const [intent, setIntent] = useState("anxiety"),
    [busy, setBusy] = useState(false);
  const profile = state.deviceProfile;
  const preview = useMemo(() => {
    if (!profile || !bible || bible.corpus.translation !== "WEB") return null;
    return starterPlanFromIntent(intent, profile.formFactor, bible);
  }, [intent, profile, bible]);
  async function begin(e: React.FormEvent) {
    e.preventDefault();
    if (!preview || !profile || busy) return;
    setBusy(true);
    try {
      await update((s) =>
        s.plans.length || s.activeId
          ? s
          : {
              ...s,
              plans: [preview],
              activeId: preview.id,
              setupSeen: true,
              translation: "WEB",
              deviceProfile: { ...profile, starterIntent: intent },
              journeyOnboarding: {
                completedAt: new Date().toISOString(),
                dismissedWelcome: false,
              },
            },
      );
      router.replace("/today");
    } catch {
      /* Provider shows a save error; keep the welcome available to retry. */
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="device-welcome" aria-labelledby="welcome-heading">
      <div className="welcome-intro">
        <Leaf size={28} strokeWidth={1} aria-hidden="true" />
        <p className="eyebrow">A QUIET BEGINNING</p>
        <h1 id="welcome-heading">Your Still on this device.</h1>
        <p>
          {
            welcomeCopy[
              profile?.starterVariant ??
                (profile ? starterVariant(profile.id) : 0)
            ]
          }
        </p>
        <p className="welcome-privacy">
          <ShieldCheck size={18} aria-hidden="true" /> This starter journey and
          anonymous profile stay on this device. Online options are your choice
          in Settings.
        </p>
      </div>
      <form className="welcome-choices" onSubmit={begin}>
        <fieldset
          disabled={busy}
          role="radiogroup"
          aria-labelledby="welcome-intent-heading"
        >
          <legend id="welcome-intent-heading">
            What would you like to make room for?
          </legend>
          <p className="field-hint">
            Choose one small beginning. You can explore more later.
          </p>
          <div className="welcome-intents">
            {starterIntents.map((option) => (
              <label key={option.id}>
                <input
                  type="radio"
                  name="starter-intent"
                  value={option.id}
                  checked={intent === option.id}
                  onChange={() => setIntent(option.id)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="welcome-preview" aria-live="polite" aria-atomic="true">
          <p className="eyebrow">YOUR JOURNEY</p>
          <h2>{preview?.title ?? "Preparing your quiet beginning…"}</h2>
          <p>
            {preview
              ? `${preview.days.length} days · Guided study · WEB`
              : "Loading the local WEB Bible and your device preferences."}
          </p>
          {preview && (
            <p className="field-hint">
              Begin with {preview.days[0].passage.reference}. Scripture,
              reflection, prayer, and one small practice each day.
            </p>
          )}
        </div>
        {profile?.formFactor === "mobile" && (
          <p className="field-hint">
            Five gentle days, at your pace. Story format works well for sharing
            verses.
          </p>
        )}
        <Button type="submit" disabled={!preview || busy}>
          {busy ? "Saving your journey…" : "Begin my journey"}
          <ArrowRight size={17} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={async () => {
            try {
              await update((s) => ({
                ...s,
                journeyOnboarding: {
                  ...s.journeyOnboarding,
                  dismissedWelcome: true,
                },
              }));
              router.push("/create");
            } catch {
              setError("Your preference could not be saved. Please try again.");
            }
          }}
        >
          Customize in Create
        </Button>
        <p className="fine-print">
          No account, model, or online Scripture access needed.
        </p>
      </form>
    </section>
  );
}

export function StartFreshSettings() {
  const { update } = useApp();
  const router = useRouter();
  const [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false);
  return (
    <section className="settings-card" id="device-welcome">
      <h2>A new beginning on this device</h2>
      <p>
        Start fresh removes saved journeys and their Practice responses from
        this browser. Your journal, notes, PIN, and preferences stay here.
        Export your data first to keep a copy.
      </p>
      <Button
        variant="outline"
        aria-expanded={confirm}
        aria-controls="reset-journeys"
        onClick={() => setConfirm(!confirm)}
      >
        Start fresh on this device
      </Button>
      {confirm && (
        <div id="reset-journeys" className="welcome-reset">
          <p id="reset-details">
            Remove these journeys and open the welcome again with a new
            anonymous device profile?
          </p>
          <div className="toolbar">
            <Button
              disabled={busy}
              aria-describedby="reset-details"
              onClick={async () => {
                setBusy(true);
                try {
                  await update((s) => ({
                    ...s,
                    plans: [],
                    activeId: null,
                    remoteIds: [],
                    setupSeen: false,
                    journeyOnboarding: {},
                    deviceProfile: createDeviceProfile(measureFormFactor()),
                    outbox: s.outbox.filter(
                      (job) => !job.path.startsWith("plans/"),
                    ),
                  }));
                  router.replace("/today");
                } catch {
                  /* Preserve the confirmation if saving fails. */
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Starting fresh…" : "Remove journeys and start fresh"}
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => setConfirm(false)}
            >
              Keep my journeys
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
