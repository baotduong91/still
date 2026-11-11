"use client";
import { Pause, Play, Square, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { verseSpeech } from "@/lib/tts/shared";
import type { ReadingPayload } from "@/lib/tts/reading";
import type { PassageType } from "@/lib/schemas";
import { useReadingAudio } from "./use-reading-audio";

const labels = {
  scripture: "Scripture",
  devotional: "reflection",
  prayer: "prayer",
  action: "action",
  interpretation: "interpretation",
};
export function ScriptureAudio({ passage }: { passage: PassageType }) {
  return (
    <ReadingAudio payload={{ kind: "scripture", ...verseSpeech(passage) }} />
  );
}
export function ReadingAudio({
  payload,
  compact = false,
}: {
  payload: ReadingPayload;
  compact?: boolean;
}) {
  const {
    status,
    engine,
    message,
    speed,
    play,
    stop,
    preferredEngine,
    empty,
    changeSpeed,
  } = useReadingAudio(payload);
  const label = labels[payload.kind];
  return (
    <div
      className={`scripture-audio${compact ? " reading-audio--compact" : ""}`}
      role="group"
      aria-label={
        payload.kind === "scripture"
          ? `Read ${payload.reference} aloud`
          : `Read ${label} aloud`
      }
    >
      <div className="scripture-audio-controls">
        <Button
          variant="outline"
          onClick={play}
          disabled={empty || status === "loading"}
          aria-label={
            status === "playing"
              ? `Pause ${label}`
              : payload.kind === "scripture"
                ? "Play Scripture"
                : `Read ${label} aloud`
          }
        >
          {status === "loading" ? (
            <LoaderCircle className="audio-loading" size={16} />
          ) : status === "playing" ? (
            <Pause size={16} />
          ) : (
            <Play size={16} />
          )}{" "}
          {status === "loading"
            ? "Preparing…"
            : status === "playing"
              ? "Pause"
              : "Play"}
        </Button>
        <Button
          variant="ghost"
          onClick={stop}
          disabled={status === "idle"}
          aria-label={`Stop ${label}`}
        >
          <Square size={15} /> Stop
        </Button>
        <label className="audio-speed">
          <span className="sr-only">Reading speed</span>
          <select
            aria-label="Reading speed"
            value={speed}
            onChange={(e) => changeSpeed(Number(e.target.value))}
          >
            {[0.8, 0.9, 1, 1.1, 1.2].map((rate) => (
              <option value={rate} key={rate}>
                {rate.toFixed(1)}×
              </option>
            ))}
          </select>
        </label>
        <span className="audio-engine">
          {engine ||
            (preferredEngine === "kokoro"
              ? "Kokoro · on-device"
              : "Edge · online")}
        </span>
      </div>
      <p
        className="audio-status"
        role={message ? "status" : undefined}
        aria-live="polite"
      >
        {message ||
          (status === "idle"
            ? preferredEngine === "kokoro"
              ? "Private reading. This stays on your device."
              : "Play sends only this Scripture and reference for reading. On-device fallback available."
            : "")}
      </p>
    </div>
  );
}
