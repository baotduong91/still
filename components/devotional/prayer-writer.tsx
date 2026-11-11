"use client";
import { useState } from "react";
import { useApp } from "@/components/provider";
import { Button } from "@/components/ui/button";
export function PrayerWriter() {
  const { update } = useApp();
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);
  return (
    <section className="settings-card">
      <p className="eyebrow">YOUR WORDS ARE WELCOME</p>
      <h3>Write your own prayer.</h3>
      <label htmlFor="personal-prayer">God, today I bring…</label>
      <textarea
        id="personal-prayer"
        value={text}
        maxLength={10000}
        onChange={(e) => {
          setText(e.target.value);
          setSaved(false);
        }}
        placeholder="An honest sentence is enough."
      />
      <Button
        disabled={!text.trim()}
        onClick={async () => {
          await update((s) => ({
            ...s,
            journals: [
              {
                id: crypto.randomUUID(),
                text: `Personal prayer\n${text.trim()}`,
                createdAt: new Date().toISOString(),
              },
              ...s.journals,
            ],
          }));
          setSaved(true);
          setText("");
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
