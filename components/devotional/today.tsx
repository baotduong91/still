"use client";
import { DailyFlow } from "./daily-flow";
import { CloudFallbackNotice } from "@/components/cloud-status";
import { Participation } from "./participation";
import { useState } from "react";
import Link from "@/components/smart-link";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  Heart,
  Leaf,
  PenLine,
} from "lucide-react";
import { useApp } from "@/components/provider";
import { Button } from "@/components/ui/button";
import { api, recoverable } from "@/lib/client/store";
import { adaptPlan } from "@/lib/ai/orchestrator";
import { localDate } from "@/lib/utils";
import type { PlanType } from "@/lib/schemas";
export function Today() {
  const { state, update, bible, savePlan, online, setError } = useApp();
  const [chosen, setChosen] = useState<number | null>(null),
    [feedback, setFeedback] = useState(""),
    [busy, setBusy] = useState(false),
    [feedbackSaved, setFeedbackSaved] = useState(false);
  const plan =
    state.plans.find((p) => p.id === state.activeId) ?? state.plans[0];
  if (!plan || !bible)
    return (
      <div className="empty-state">
        <Leaf />
        <h1>A quiet moment is on its way.</h1>
        <p>Preparing your saved Scripture and journey…</p>
        <Link href="/create">Create a journey</Link>
      </div>
    );
  const current =
    chosen ??
    (plan.days.findIndex((d) => !d.completedAt) === -1
      ? plan.days.length - 1
      : plan.days.findIndex((d) => !d.completedAt));
  const day = plan.days[current];
  const done = plan.days.filter((d) => d.completedAt).length;
  const focal = (day.webPassage ?? day.passage).verses.at(-1)!;
  const passage = bible.lookup(
    `${focal.book} ${focal.chapter}:${focal.verse}`,
    state.translation,
  );
  async function complete() {
    setBusy(true);
    try {
      const remote = state.remoteIds.includes(plan.id);
      const body = { planId: plan.id, day: day.number, date: localDate() };
      const copy = structuredClone(plan);
      copy.days[current].completedAt ??= new Date().toISOString();
      copy.days[current].completedDate ??= localDate();
      copy.revision++;
      if (online && remote) {
        try {
          const result = await api<{ plan: PlanType }>("plans/complete", body);
          await savePlan(result.plan);
        } catch (error) {
          if (!recoverable(error)) throw error;
          await savePlan(copy);
          await update((s) => ({
            ...s,
            remoteIds: s.remoteIds.filter((id) => id !== plan.id),
            outbox: s.outbox.filter(
              (j) => (j.body as { planId?: string }).planId !== plan.id,
            ),
          }));
        }
      } else {
        await savePlan(copy);
        if (remote)
          await update((s) => ({
            ...s,
            outbox: [...s.outbox, { path: "plans/complete", body }],
          }));
      }
      setChosen(current);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function reflect() {
    if (!feedback.trim()) return;
    setBusy(true);
    try {
      if (online && state.remoteIds.includes(plan.id)) {
        try {
          const result = await api<{ plan: PlanType }>("plans/adapt", {
            planId: plan.id,
            day: day.number,
            feedback,
            revision: plan.revision,
          });
          await savePlan(result.plan);
        } catch (error) {
          if (!recoverable(error)) throw error;
          await savePlan(adaptPlan(plan, day.number, feedback));
          await update((s) => ({
            ...s,
            remoteIds: s.remoteIds.filter((id) => id !== plan.id),
            outbox: s.outbox.filter(
              (j) => (j.body as { planId?: string }).planId !== plan.id,
            ),
          }));
        }
      } else {
        await savePlan(adaptPlan(plan, day.number, feedback));
      }
      setFeedbackSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="today-page">
      <CloudFallbackNotice />
      <h1 className="sr-only">A little stillness. A little closer.</h1>
      <div className="today-columns">
        <DailyFlow
          key={`${plan.id}:${day.number}`}
          localPassage={passage}
          plan={plan}
          day={day}
          busy={busy}
          onComplete={complete}
        />
        <aside className="today-aside">
          <section className="journey-overview">
            <div className="section-label">
              <RouteIcon />
              <span>YOUR JOURNEY</span>
            </div>
            <h3>{plan.title}</h3>
            <p>
              A little room for Scripture.
              <br />A steady step toward your intention.
            </p>
            <div className="progress-meta">
              <span>
                {done} of {plan.days.length} days complete
              </span>
              <span>{Math.round((done / plan.days.length) * 100)}%</span>
            </div>
            <div className="progress-track">
              <span style={{ width: `${(done / plan.days.length) * 100}%` }} />
            </div>
            <div className="day-dots">
              {plan.days.map((d, i) => (
                <button
                  key={d.number}
                  aria-label={`Open day ${d.number}`}
                  aria-current={current === i ? "step" : undefined}
                  className={`${current === i ? "current" : ""} ${d.completedAt ? "done" : ""}`}
                  onClick={() => {
                    setChosen(i);
                    setFeedback("");
                    requestAnimationFrame(() =>
                      document
                        .getElementById("today-scripture")
                        ?.scrollIntoView({
                          block: "start",
                          behavior: window.matchMedia(
                            "(prefers-reduced-motion: reduce)",
                          ).matches
                            ? "instant"
                            : "smooth",
                        }),
                    );
                    setFeedbackSaved(false);
                  }}
                >
                  {d.completedAt ? <Check size={12} /> : d.number}
                </button>
              ))}
            </div>
            <Link className="text-link" href="/journey">
              View your journey <ArrowRight size={15} />
            </Link>
          </section>
          <section className="intention-card">
            <Heart size={18} />
            <p className="eyebrow">A GENTLE REMINDER</p>
            <p>
              You don’t have to have
              <br />
              it all figured out
              <br />
              <em>to take the next step.</em>
            </p>
            <span>SHOW UP AS YOU ARE.</span>
          </section>
          <Link href="/chat" className="chat-prompt">
            <span className="chat-mini-icon">
              <BookOpen size={19} />
            </span>
            <span>
              <strong>Bring your questions.</strong>
              <small>Explore Scripture together</small>
            </span>
            <ArrowUpRight size={18} />
          </Link>
        </aside>
      </div>
      <Participation />
      <section className="reflection-strip">
        <span className="journal-icon">
          <PenLine size={22} />
        </span>
        <div>
          <p className="eyebrow">A MOMENT TO NOTICE</p>
          <h3>What is staying with you?</h3>
          <p>Leave a thought for tonight. There’s no right answer.</p>
        </div>
        <div className="reflection-input">
          <label className="sr-only" htmlFor="reflection">
            What stood out today?
          </label>
          <textarea
            id="reflection"
            maxLength={1200}
            value={feedback}
            onChange={(e) => {
              setFeedback(e.target.value);
              setFeedbackSaved(false);
            }}
            placeholder="A word, a feeling, a small discovery…"
          />
          <button
            aria-label="Save reflection and adapt remaining days"
            disabled={busy || feedback.trim().length < 3}
            onClick={reflect}
          >
            <ArrowRight size={18} />
          </button>
          {feedbackSaved && (
            <span className="saved-label" role="status">
              Saved. Future days gently updated.
            </span>
          )}
        </div>
      </section>
    </div>
  );
}
function RouteIcon() {
  return <Leaf size={16} />;
}
