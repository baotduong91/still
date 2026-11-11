"use client";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/components/provider";
import { Button } from "@/components/ui/button";
import { kokoroAudio } from "@/lib/tts/kokoro-client";
import { readingAudioEvent } from "@/lib/tts/reading";
import type { SpeechEngine } from "@/lib/tts/shared";
import { offlineModelStored } from "@/lib/tts/model-cache";
export function AudioSettings() {
  const { state, update, online } = useApp();
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  return (
    <section className="settings-card" id="reading-voice">
      <h2>A voice for the Word</h2>
      <label htmlFor="speech-engine">Reading voice engine</label>
      <select
        id="speech-engine"
        value={state.speechEngine}
        onChange={(e) =>
          void update((s) => ({
            ...s,
            speechEngine: e.target.value as SpeechEngine,
          }))
        }
      >
        <option value="auto">Auto · Edge online, Kokoro offline</option>
        <option value="edge">Edge · Jenny · online preferred</option>
        <option value="kokoro">Kokoro · Bella · private, on-device</option>
      </select>
      <p className="field-hint">
        Auto and Edge send only the displayed Scripture and its reference to
        Microsoft when you tap Play. If unavailable, they try Kokoro, then an
        installed on-device voice. Kokoro never sends your text to a server.
        Reflections, plan prayers, actions, and chat interpretation are read
        only on-device with Kokoro or an installed local voice. Personal
        prayers, journal entries, and notes are excluded.
      </p>
      <p className="field-hint">
        Download Bella once while online for offline reading. First use may
        download roughly 90 MB (WASM) or 330 MB (WebGPU), plus runtime files.
        Keep this screen open until ready. Your browser may remove downloads
        when storage is low.
      </p>
      <Button
        variant="outline"
        disabled={busy || !online}
        onClick={async () => {
          window.dispatchEvent(
            new CustomEvent(readingAudioEvent, { detail: "prepare" }),
          );
          const controller = new AbortController();
          abort.current = controller;
          setBusy(true);
          setMessage(
            "Preparing Bella. Downloading model files only; no personal text is sent…",
          );
          try {
            const result = await kokoroAudio(
              null,
              setMessage,
              controller.signal,
            );
            if (!controller.signal.aborted) {
              if (!(await offlineModelStored())) {
                setMessage(
                  "Bella can read now, but this browser could not save its model for offline use. Free some storage and try downloading again.",
                );
                return;
              }
              await navigator.storage?.persist?.().catch(() => false);
              setMessage(
                `Bella is ready on this device · ${result.backend}. Model and voice files are cached for offline use while browser storage is retained.`,
              );
            }
          } catch {
            if (!controller.signal.aborted)
              setMessage(
                "The on-device download did not finish. Check your connection and free space, then try again.",
              );
          } finally {
            if (!controller.signal.aborted) setBusy(false);
          }
        }}
      >
        {busy ? "Preparing on-device voice…" : "Download on-device voice"}
      </Button>
      {busy && (
        <Button
          variant="ghost"
          onClick={() => {
            abort.current?.abort();
            setBusy(false);
            setMessage(
              "Download stopped. Saved files remain; you can try again whenever you’re ready.",
            );
          }}
        >
          Cancel download
        </Button>
      )}
      {message && (
        <p role="status" className="field-hint">
          {message}
        </p>
      )}
    </section>
  );
}
