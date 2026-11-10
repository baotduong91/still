"use client";
import { useState } from "react";
import Link from "@/components/smart-link";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  Heart,
  Leaf,
  Sun,
  PenLine,
} from "lucide-react";
import { useApp } from "@/components/provider";
import { Button } from "@/components/ui/button";
import { PassageCard } from "@/components/scripture/passage";
import { api, recoverable } from "@/lib/client/store";
import { adaptPlan } from "@/lib/ai/orchestrator";
import { localDate } from "@/lib/utils";
import type { PlanType } from "@/lib/schemas";
export function Today() {
  const { state, update, bible, savePlan, online, setError } = useApp();
  const [step, setStep] = useState(0),
    [chosen, setChosen] = useState<number | null>(null),
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
  const focal = day.passage.verses.at(-1)!;
  const passage = bible.lookup(
    `${focal.book} ${focal.chapter}:${focal.verse}`,
    state.translation,
  );
  const labels = ["Scripture", "Reflection", "Prayer", "Practice"];
  const date = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
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
      <div className="page-heading">
        <div>
          <p className="eyebrow date-line">
            <Sun size={15} />
            {date}
          </p>
          <h1>
            A little stillness.
            <br />
            <em>A little closer.</em>
          </h1>
          <p className="page-intro">
            Pause the noise. Let the Word meet you here.
          </p>
        </div>
        <span className="rhythm-pill">
          <Leaf size={17} />
          {
            new Set(
              state.plans.flatMap((p) =>
                p.days.map((d) => d.completedDate).filter(Boolean),
              ),
            ).size
          }{" "}
          days of showing up
        </span>
      </div>
      <div className="today-columns">
        <section className="daily-card">
          <div className="landscape">
            <div className="landscape-sun" />
            <div className="hill hill-back" />
            <div className="hill hill-front" />
            <div className="landscape-content">
              <span className="glass-label">YOUR DAILY RHYTHM</span>
              <h2>{day.title}</h2>
              <p>
                {plan.title} <span>·</span> Day {day.number} of{" "}
                {plan.days.length}
              </p>
            </div>
            <span className="landscape-mark">
              <Leaf size={23} />
            </span>
          </div>
          <div className="sequence" role="tablist" aria-label="Daily rhythm">
            {labels.map((label, i) => (
              <button
                key={label}
                role="tab"
                tabIndex={step === i ? 0 : -1}
                onKeyDown={(e) => {
                  if (
                    ["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)
                  ) {
                    e.preventDefault();
                    const next =
                      e.key === "Home"
                        ? 0
                        : e.key === "End"
                          ? 3
                          : (i + (e.key === "ArrowRight" ? 1 : 3)) % 4;
                    setStep(next);
                    (
                      e.currentTarget.parentElement?.children[
                        next
                      ] as HTMLButtonElement
                    )?.focus();
                  }
                }}
                aria-selected={step === i}
                aria-controls="daily-panel"
                onClick={() => setStep(i)}
                className={step === i ? "selected" : ""}
              >
                <span>
                  {i < step ? (
                    <Check size={11} />
                  ) : (
                    String(i + 1).padStart(2, "0")
                  )}
                </span>
                {label}
              </button>
            ))}
          </div>
          <div
            className="daily-body"
            id="daily-panel"
            role="tabpanel"
            aria-label={labels[step]}
          >
            {step === 0 ? (
              <>
                <PassageCard passage={passage} />
                <Link
                  className="text-link"
                  href={`/scripture?ref=${encodeURIComponent(day.passage.reference)}`}
                >
                  <BookOpen size={15} /> Read in context{" "}
                  <ArrowUpRight size={14} />
                </Link>
              </>
            ) : step === 1 ? (
              <div className="devotional-prose">
                <p className="eyebrow">LET IT TAKE ROOT</p>
                <h3>{day.title}</h3>
                <p>{day.reflection}</p>
                <div className="question-box">
                  {day.questions.map((q) => (
                    <p key={q}>{q}</p>
                  ))}
                </div>
                <p className="fine-print">{day.interpretation}</p>
              </div>
            ) : step === 2 ? (
              <div className="devotional-prose">
                <p className="eyebrow">A PRAYER FOR TODAY</p>
                <h3>Come as you are.</h3>
                <p className="prayer-text">{day.prayer}</p>
                <p className="fine-print">
                  A personal prayer inspired by your reading; not Scripture.
                </p>
              </div>
            ) : (
              <div className="devotional-prose">
                <p className="eyebrow">ONE SMALL, FAITHFUL STEP</p>
                <h3>Carry it into your day.</h3>
                <p>{day.action}</p>
                {day.completedAt && (
                  <div className="completion-note">
                    <Check size={20} />
                    <span>You made space today. That is enough.</span>
                  </div>
                )}
              </div>
            )}
            <div className="daily-bottom">
              <span>
                {step + 1} OF 4 <span className="small-dot">·</span> AT YOUR OWN
                PACE
              </span>
              {step < 3 ? (
                <Button onClick={() => setStep(step + 1)}>
                  Continue to {labels[step + 1].toLowerCase()}{" "}
                  <ArrowRight size={16} />
                </Button>
              ) : (
                <Button onClick={complete} disabled={busy || !!day.completedAt}>
                  {day.completedAt ? (
                    <>
                      <Check size={16} />
                      Day complete
                    </>
                  ) : (
                    "Complete today"
                  )}
                </Button>
              )}
            </div>
          </div>
        </section>
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
                    setStep(0);
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
