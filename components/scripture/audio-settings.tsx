"use client";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/components/provider";
import { Button } from "@/components/ui/button";
import { resetBellaBackend } from "@/lib/tts/kokoro-client";
import { readingAudioEvent } from "@/lib/tts/reading";
import { privateVoice, clearPrivatePreviews } from "@/lib/tts/private-voice";
import type { SpeechEngine } from "@/lib/tts/shared";
import { prepareSpeechRuntime } from "@/lib/tts/model-cache";
export function AudioSettings() {
  const { state, update, online } = useApp();
  const voice = privateVoice(state.speechEngine);
  const [gpu, setGpu] = useState(false);
  useEffect(
    () => setGpu(localStorage.getItem("still-bella-gpu") === "true"),
    [],
  );
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
        <option value="paradee">
          Edge + Paradee 1.1 · Heart · recommended
        </option>
        <option value="auto">Auto · Edge online, Kokoro offline</option>
        <option value="edge">Edge · Jenny · online preferred</option>
        <option value="kokoro">Kokoro · Bella · private, on-device</option>
        <option value="device">
          Device voice · instant · no model download
        </option>
      </select>
      <p className="field-hint">
        Auto and Edge send only the displayed Scripture and its reference to
        Microsoft when you tap Play. Paradee mode also uses Edge for online
        Scripture, and Heart for all private reading or offline Scripture. If
        Edge is unavailable, the selected on-device voice is used. An installed
        device voice is used only when you choose it. Neither Paradee nor Kokoro
        sends your text to a server. Reflections, plan prayers, actions, and
        chat interpretation are read only on-device with Paradee, Kokoro, or an
        installed local voice. Personal prayers, journal entries, and notes are
        excluded.
      </p>
      {state.speechEngine === "paradee" ? (
        <p className="field-hint">
          Download Paradee 1.1 here before private listening. Heart is a warm US
          female voice distilled from Kokoro, with an 8.5 MB model plus the
          shared speech runtime. It sounds different from Bella and needs no
          GPU. Keep this screen open until ready; saved assets work offline
          while browser storage is retained. Today prepares the next section
          locally.
        </p>
      ) : (
        <p className="field-hint">
          Download Bella here before private listening. The smaller WASM model
          is roughly 90 MB. Optional desktop WebGPU uses a larger fp32 download
          and may prepare faster on supported hardware. Both use Bella. Keep
          this screen open until ready. First synthesis may take 1–3 minutes;
          downloaded assets persist while browser storage is retained. Today
          prepares real section text ahead of playback.
        </p>
      )}
      {state.speechEngine !== "paradee" && (
        <label>
          <input
            type="checkbox"
            checked={gpu}
            disabled={busy}
            onChange={(e) => {
              const enabled = e.target.checked;
              setGpu(enabled);
              localStorage.setItem("still-bella-gpu", String(enabled));
              resetBellaBackend();
            }}
          />{" "}
          Prefer desktop WebGPU · larger download; WASM fallback
        </label>
      )}
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
            const runtime = prepareSpeechRuntime();
            const synthesis = voice.audio(
              null,
              setMessage,
              controller.signal,
              undefined,
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
            const [, result] = await Promise.all([runtime, synthesis]);
            if (!controller.signal.aborted) {
              if (!(await voice.stored())) {
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
