"use client";
import { useEffect, useRef, useState } from "react";
import {
  LoaderCircle,
  MoreHorizontal,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Square,
} from "lucide-react";
import type { PassageType } from "@/lib/schemas";
import { bibleSegment } from "@/lib/client/bible-position";
import { verseSpeech } from "@/lib/tts/shared";
import { useReadingAudio } from "./use-reading-audio";

export function BiblePlayer({
  passage,
  pending,
  verse,
  onVerse,
}: {
  passage: PassageType;
  pending: boolean;
  verse: number;
  onVerse: (verse: number) => void;
}) {
  const [cursor, setCursor] = useState(verse);
  const [continuous, setContinuous] = useState(true);
  const segment = bibleSegment(passage, cursor);
  const reader = useReadingAudio(
    { kind: "scripture", ...verseSpeech(segment.passage) },
    { licensedTextPending: pending },
  );
  const active = useRef(reader);
  active.current = reader;
  const carry = useRef<number | null>(null);
  const consumed = useRef(0);
  const menu = useRef<HTMLDetailsElement>(null);
  const identity = `${passage.reference}|${passage.translation}`;
  useEffect(() => {
    carry.current = null;
    setCursor(verse);
    active.current.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, pending]);
  useEffect(() => {
    if (reader.status === "idle" && carry.current === null) setCursor(verse);
  }, [verse, reader.status]);
  function move(next: number, resume = reader.status === "playing") {
    carry.current = resume ? next : null;
    setCursor(next);
    onVerse(next);
  }
  useEffect(() => {
    if (pending || carry.current !== cursor) return;
    const timer = setTimeout(() => {
      if (carry.current !== cursor) return;
      carry.current = null;
      if (active.current.status === "idle") void active.current.play();
    }, 48);
    return () => clearTimeout(timer);
  }, [cursor, pending]);
  useEffect(() => {
    if (reader.completed <= consumed.current) return;
    consumed.current = reader.completed;
    if (continuous && segment.next !== undefined) move(segment.next, true);
    else onVerse(segment.passage.verses.at(-1)!.verse);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reader.completed]);
  useEffect(() => {
    if (reader.canKeepWaiting && menu.current) menu.current.open = true;
  }, [reader.canKeepWaiting]);
  const playing = reader.status === "playing";
  return (
    <section className="bible-player" aria-label="Bible reading player">
      <div className="bible-player-meta">
        <strong>{segment.passage.reference}</strong>
        <span>
          {pending
            ? `${passage.requestedTranslation} · loading`
            : `${passage.translation} · ${reader.message || reader.engine || (reader.preferredEngine === "device" ? "Device voice" : reader.preferredEngine === "edge" ? "Edge · Jenny" : "Paradee · on-device")}`}
        </span>
      </div>
      <button
        type="button"
        aria-label="Previous reading passage"
        disabled={pending || !segment.hasPrevious}
        onClick={() => move(segment.previous!)}
      >
        <SkipBack size={17} />
      </button>
      <button
        type="button"
        className="bible-player-play"
        aria-label={playing ? "Pause Bible reading" : "Play Bible reading"}
        disabled={pending || reader.status === "loading"}
        onClick={() => void reader.play()}
      >
        {reader.status === "loading" ? (
          <LoaderCircle size={20} className="audio-loading" />
        ) : playing ? (
          <Pause size={20} />
        ) : (
          <Play size={20} />
        )}
      </button>
      <button
        type="button"
        aria-label="Next reading passage"
        disabled={pending || segment.next === undefined}
        onClick={() => move(segment.next!)}
      >
        <SkipForward size={17} />
      </button>
      <details
        ref={menu}
        className="bible-player-menu"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.currentTarget.open = false;
            event.currentTarget.querySelector("summary")?.focus();
          }
        }}
      >
        <summary aria-label="Bible audio settings">
          <MoreHorizontal size={20} />
        </summary>
        <div>
          <label>
            Reading speed
            <select
              aria-label="Bible reading speed"
              value={reader.speed}
              onChange={(event) =>
                reader.changeSpeed(Number(event.target.value))
              }
            >
              {[0.8, 0.9, 1, 1.1, 1.2].map((rate) => (
                <option key={rate} value={rate}>
                  {rate.toFixed(1)}×
                </option>
              ))}
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={continuous}
              onChange={(event) => {
                setContinuous(event.target.checked);
                if (!event.target.checked) carry.current = null;
              }}
            />{" "}
            Continue through this passage
          </label>
          <button
            type="button"
            onClick={() => {
              carry.current = null;
              reader.stop();
              if (menu.current) menu.current.open = false;
            }}
          >
            <Square size={15} /> Stop Bible reading
          </button>
          {reader.canKeepWaiting && (
            <button type="button" onClick={reader.keepWaiting}>
              Keep waiting
            </button>
          )}
          {!!reader.message && reader.preferredEngine !== "device" && (
            <button type="button" onClick={reader.playDevice}>
              Use device voice
            </button>
          )}
          <p>
            {reader.message ||
              "Reads exact retrieved Scripture and its reference. Uses your voice preference. Edge sends only Scripture; on-device reading stays private. Playback starts only when you press Play."}
          </p>
        </div>
      </details>
      <div
        className="bible-player-progress"
        role="progressbar"
        aria-label="Bible audio progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(reader.progress * 100)}
      >
        <span style={{ width: `${reader.progress * 100}%` }} />
      </div>
      {!!reader.message && (
        <span className="sr-only" role="status">
          {reader.message}
        </span>
      )}
    </section>
  );
}
