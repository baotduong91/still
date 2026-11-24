"use client";
import { useRef, useState } from "react";
import { useApp } from "@/components/provider";
import { Button } from "@/components/ui/button";
import type { JournalType } from "@/lib/schemas";
export function PrayerWriter() {
  const { update, setError } = useApp();
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  // A failed write can leave an optimistic entry in memory. Retry the same entry.
  const pending = useRef<JournalType | null>(null);
  return (
    <section className="settings-card">
      <p className="eyebrow">YOUR WORDS ARE WELCOME</p>
      <h3>Write your own prayer.</h3>
      <label htmlFor="personal-prayer">God, today I bring…</label>
      <textarea
        id="personal-prayer"
        value={text}
        readOnly={saving}
        maxLength={10000}
        onChange={(e) => {
          setText(e.target.value);
          setSaved(false);
        }}
        placeholder="An honest sentence is enough."
      />
      <Button
        disabled={!text.trim() || saving}
        onClick={async () => {
          setSaving(true);
          if (pending.current) setError("");
          try {
            const entry = {
              id: pending.current?.id ?? crypto.randomUUID(),
              text: `Personal prayer\n${text.trim()}`,
              createdAt: pending.current?.createdAt ?? new Date().toISOString(),
            };
            pending.current = entry;
            await update((s) => ({
              ...s,
              journals: [
                entry,
                ...s.journals.filter((item) => item.id !== entry.id),
              ],
            }));
            pending.current = null;
            setSaved(true);
            setText("");
          } catch (error) {
            setError((error as Error).message);
          } finally {
            setSaving(false);
          }
        }}
      >
        Keep this prayer
      </Button>
      {saved && (
        <p role="status">Saved privately in your journal on this device.</p>
      )}
    </section>
  );
}
