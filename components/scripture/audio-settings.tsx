"use client";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/components/provider";
import { Button } from "@/components/ui/button";
import { readingAudioEvent } from "@/lib/tts/reading";
import {
  privateVoice,
  clearPrivatePreviews,
  downloadPrivateVoice,
} from "@/lib/tts/private-voice";
import type { SpeechEngine } from "@/lib/tts/shared";
export function AudioSettings() {
  const { state, update, online } = useApp();
  const voice = privateVoice(state.speechEngine);
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [canKeepWaiting, setCanKeepWaiting] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const extendWait = useRef<(() => void) | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  return (
    <section className="settings-card" id="reading-voice">
      <h2>A voice for the Word</h2>
      <label htmlFor="speech-engine">Reading voice engine</label>
      <select
        id="speech-engine"
        value={state.speechEngine}
        disabled={busy}
        onChange={(e) => {
          window.dispatchEvent(
            new CustomEvent(readingAudioEvent, { detail: "voice-change" }),
          );
          clearPrivatePreviews();
          setMessage("");
          void update((s) => ({
            ...s,
            speechEngine: e.target.value as SpeechEngine,
          }));
        }}
      >
        <option value="paradee">Paradee 1.1 · Heart · recommended</option>
        <option value="edge">Edge · Jenny · standalone Scripture online</option>
        <option value="device">
          Device voice · instant · no model download
        </option>
      </select>
      <p className="field-hint">
        Today uses Paradee 1.1 · Heart on-device for Scripture, reflection,
        prayer, and practice. Edge Jenny is available for standalone Scripture
        when selected and online. Choose Device voice to use an installed voice.
      </p>
      <p className="field-hint">
        Today automatically downloads the 8.5 MB Paradee model and shared speech
        runtime while online, then prepares the next section in the background.
        You can also prepare it here. Saved files work offline while browser
        storage is retained. No GPU or account is required.
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
          setCanKeepWaiting(false);
          extendWait.current = null;
          setMessage(
            `Preparing ${voice.name}. Downloading model files only; no personal text is sent…`,
          );
          try {
            const result = await downloadPrivateVoice(
              state.speechEngine,
              controller.signal,
              setMessage,
              {
                onWaiting: setMessage,
                onTimeout: (extend) => {
                  if (controller.signal.aborted) return;
                  extendWait.current = extend;
                  setCanKeepWaiting(true);
                  setMessage(
                    `${voice.name} still needs more time. Keep waiting, or cancel and try again later.`,
                  );
                },
              },
            );
            if (!controller.signal.aborted) {
              if (!result.stored) {
                setMessage(
                  `${voice.name} can read now, but this browser could not save its model for offline use. Free some storage and try downloading again.`,
                );
                return;
              }
              await navigator.storage?.persist?.().catch(() => false);
              setMessage(
                `${voice.name} is ready on this device · ${result.backend}. Model and voice files are cached for offline use while browser storage is retained.`,
              );
            }
          } catch {
            if (!controller.signal.aborted)
              setMessage(
                "The on-device download did not finish. Check your connection and free space, then try again.",
              );
          } finally {
            if (abort.current === controller) {
              extendWait.current = null;
              setCanKeepWaiting(false);
              setBusy(false);
            }
            controller.abort();
          }
        }}
      >
        {busy ? "Preparing on-device voice…" : "Download on-device voice"}
      </Button>
      {busy && canKeepWaiting && (
        <Button
          variant="outline"
          onClick={() => {
            extendWait.current?.();
            extendWait.current = null;
            setCanKeepWaiting(false);
            setMessage(
              `Still preparing ${voice.name}’s first synthesis on-device…`,
            );
          }}
        >
          Keep waiting
        </Button>
      )}
      {busy && (
        <Button
          variant="ghost"
          onClick={() => {
            abort.current?.abort();
            extendWait.current = null;
            setCanKeepWaiting(false);
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
