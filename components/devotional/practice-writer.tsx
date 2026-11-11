"use client";
import { useState } from "react";
import { useApp } from "@/components/provider";
import { Button } from "@/components/ui/button";
import type { PlanType, DayType } from "@/lib/schemas";
export function PracticeWriter({
  plan,
  day,
  onComplete,
}: {
  plan: PlanType;
  day: DayType;
  onComplete: () => Promise<void>;
}) {
  const { savePlan, setError } = useApp();
  const [text, setText] = useState(day.practiceResponse ?? ""),
    [saved, setSaved] = useState(false),
    [busy, setBusy] = useState(false);
  async function save() {
    const copy = structuredClone(plan);
    copy.days[day.number - 1].practiceResponse = text;
    await savePlan(copy);
    setSaved(true);
  }
  return (
    <form
      id="practice-response-form"
      className="practice-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await save();
          await onComplete();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label htmlFor="practice-response">My response for today</label>
      <textarea
        id="practice-response"
        maxLength={10000}
        rows={4}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSaved(false);
        }}
        placeholder="A worry to name, a responsibility to tend, or one small step…"
      />
      <p className="fine-print">
        Optional. Saved with this day on this device. Your words are not
        automatically sent to a model.
      </p>
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        onClick={async () => {
          try {
            await save();
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        Save my response
      </Button>
      {saved && (
        <p role="status">Your response is saved with Day {day.number}.</p>
      )}
    </form>
  );
}
