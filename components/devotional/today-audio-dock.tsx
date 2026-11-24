"use client";
import { useEffect, useState, type CSSProperties } from "react";
import { useApp } from "@/components/provider";
import type { ReadingPayload } from "@/lib/tts/reading";
import { stopAmbientLoop } from "@/lib/audio/ambient-player";
import { primeAmbientFromGesture, useAmbientAudio } from "./use-ambient-audio";
import type { useReadingAudio } from "@/components/scripture/use-reading-audio";
import {
  LoaderCircle,
  Music2,
  Pause,
  Play,
  RotateCcw,
  Square,
  Volume2,
  VolumeX,
} from "lucide-react";

const sectionLabels: Record<ReadingPayload["kind"], string> = {
  scripture: "YOUR VERSE",
  devotional: "YOUR DEVOTIONAL",
  prayer: "YOUR PRAYER",
  action: "YOUR PRACTICE",
  interpretation: "YOUR REFLECTION",
};

export function TodayAudioDock({
  reader,
  payload,
  contextLabel,
  sectionTitle,
  scripturePending,
  autoplay,
  onAutoplayChange,
  voicePreparing,
}: {
  reader: ReturnType<typeof useReadingAudio> & {
    progress?: number;
    seekBy?: (seconds: number) => void;
    restartSection?: () => void;
  };
  payload: ReadingPayload;
  contextLabel?: string;
  sectionTitle?: string;
  scripturePending?: boolean;
  autoplay?: boolean;
  onAutoplayChange?: (enabled: boolean) => void;
  voicePreparing?: boolean;
}) {
  const { state, update } = useApp();
  const voiceOn = state.todayVoiceOn !== false;
  const ambientOn = state.todayAmbientOn === true;
  const voiceActive =
    voiceOn && (reader.status === "playing" || reader.status === "loading");
  const [musicOnlyPlaying, setMusicOnlyPlaying] = useState(false);
  const playing = voiceOn ? reader.status === "playing" : musicOnlyPlaying;
  // Keep the bed latched through section handoffs and natural completion.
  // Pause/Stop, the music toggle, and unmount still end it explicitly.
  useEffect(() => {
    if (voiceActive && ambientOn) setMusicOnlyPlaying(true);
  }, [voiceActive, ambientOn]);
  useEffect(() => {
    if (reader.status === "paused") setMusicOnlyPlaying(false);
  }, [reader.status]);
  const musicError = useAmbientAudio(
    ambientOn && (musicOnlyPlaying || voiceActive),
    voiceActive,
    Math.max(0, Math.min(1, state.todayMusicLevel ?? 0.5)) / 0.5,
  );
  const [musicNotice, setMusicNotice] = useState("");
  function startMusic(withVoice: boolean) {
    setMusicNotice("");
    void primeAmbientFromGesture(
      true,
      Math.max(0, Math.min(1, state.todayMusicLevel ?? 0.5)) / 0.5,
      withVoice,
    ).catch(() =>
      setMusicNotice(
        "Music could not start. Tap the music button to try again.",
      ),
    );
  }

  const {
    status,
    engine,
    message,
    preferredEngine,
    empty,
    progress = 0,
    play,
    stop,
    seekBy,
    restartSection,
  } = reader;

  const readingLabel = !voiceOn
    ? "background music"
    : payload.kind === "scripture"
      ? "Scripture"
      : payload.kind === "devotional"
        ? "reflection"
        : payload.kind;
  const canSeek =
    typeof seekBy === "function" &&
    (status === "playing" || status === "paused") &&
    preferredEngine !== "device" &&
    !engine.startsWith("Device voice");

  async function transport() {
    if (!voiceOn) {
      setMusicOnlyPlaying(!musicOnlyPlaying);
      if (!musicOnlyPlaying && ambientOn) startMusic(false);
      else stopAmbientLoop();
      return;
    }
    // Unlock Web Audio inside the gesture, but never wait for music decoding
    // before starting narration. The bed joins as soon as it is decoded.
    setMusicOnlyPlaying(false);
    if (!playing && ambientOn) startMusic(true);
    await play();
  }

  return (
    <div
      className="today-audio-dock scripture-audio reading-audio--minimal"
      role="group"
      aria-label={
        payload.kind === "scripture"
          ? `Listen to ${payload.reference}`
          : `Listen to today's ${payload.kind}`
      }
    >
      <div className="today-audio-heading">
        <p className="today-audio-eyebrow">
          {sectionLabels[payload.kind]}
          {sectionTitle ? ` · ${sectionTitle}` : ""}
        </p>
        {contextLabel && <p className="reading-context">{contextLabel}</p>}
      </div>
      <div className="today-transport">
        <button
          type="button"
          className="today-skip"
          disabled={!canSeek}
          aria-label="Rewind 5 seconds"
          onClick={() => seekBy?.(-5)}
        >
          <span className="today-skip-mark">↺</span>
          <span>5</span>
        </button>
        <button
          type="button"
          className="today-play"
          disabled={
            voiceOn
              ? empty || status === "loading" || scripturePending
              : !ambientOn
          }
          style={
            {
              "--today-progress": `${Math.round(progress * 100)}%`,
            } as CSSProperties
          }
          aria-label={
            playing
              ? `Pause ${readingLabel}`
              : !voiceOn
                ? "Play background music"
                : payload.kind === "scripture"
                  ? "Play Scripture"
                  : `Read ${readingLabel} aloud`
          }
          onClick={() => void transport()}
        >
          {voiceOn && status === "loading" ? (
            <LoaderCircle className="audio-loading" size={28} />
          ) : playing ? (
            <Pause size={28} />
          ) : (
            <Play size={28} />
          )}
        </button>
        <button
          type="button"
          className="today-skip"
          disabled={!canSeek}
          aria-label="Forward 5 seconds"
          onClick={() => seekBy?.(5)}
        >
          <span className="today-skip-mark today-skip-mark-forward">↻</span>
          <span>5</span>
        </button>
        <button
          type="button"
          className="today-transport-icon today-restart"
          disabled={empty || !voiceOn}
          aria-label="Restart this section"
          onClick={() => restartSection?.()}
        >
          <RotateCcw size={20} />
        </button>
      </div>
      <div className="today-audio-toggles">
        <button
          type="button"
          className={`today-corner-toggle${voiceOn ? " is-on" : ""}`}
          aria-pressed={voiceOn}
          aria-label={
            voiceOn ? "Turn voice reading off" : "Turn voice reading on"
          }
          onClick={() => {
            void update((s) => {
              const next = { ...s, todayVoiceOn: !voiceOn };
              return next;
            });
            if (voiceOn && status !== "idle") stop();
          }}
        >
          {voiceOn ? <Volume2 size={22} /> : <VolumeX size={22} />}
          <span className="sr-only">Voice</span>
        </button>
        {onAutoplayChange && (
          <label className="today-autoplay">
            <input
              type="checkbox"
              aria-label="Autoplay next section"
              checked={autoplay ?? false}
              onChange={(event) => onAutoplayChange(event.target.checked)}
            />
            <span>Autoplay</span>
          </label>
        )}
        <button
          type="button"
          className={`today-corner-toggle today-music-toggle${ambientOn ? " is-on" : ""}`}
          aria-pressed={ambientOn}
          aria-label="Background music"
          onClick={() => {
            const next = !ambientOn;
            void update((s) => ({ ...s, todayAmbientOn: next }));
            if (next) {
              setMusicOnlyPlaying(!voiceActive);
              startMusic(voiceActive);
            } else {
              setMusicNotice("");
            }
            if (!next) {
              setMusicOnlyPlaying(false);
              stopAmbientLoop();
            }
          }}
        >
          <Music2 size={18} aria-hidden="true" />
          <span aria-hidden="true">{ambientOn ? "On" : "Off"}</span>
        </button>
      </div>
      <button
        className="today-stop-control"
        type="button"
        aria-label={`Stop ${readingLabel}`}
        disabled={status === "idle" && !musicOnlyPlaying}
        onClick={() => {
          stop();
          setMusicOnlyPlaying(false);
          stopAmbientLoop();
        }}
      >
        <Square size={16} />
      </button>
      {(reader.canKeepWaiting ||
        (!!message && preferredEngine !== "device")) && (
        <div className="audio-recovery">
          {reader.canKeepWaiting && (
            <button type="button" onClick={reader.keepWaiting}>
              Keep waiting
            </button>
          )}
          {preferredEngine !== "device" && (
            <button type="button" onClick={reader.playDevice}>
              Use device voice · no download
            </button>
          )}
        </div>
      )}
      <span className="audio-engine">
        {engine ||
          (preferredEngine === "device"
            ? "Device voice · installed"
            : preferredEngine === "paradee"
              ? "Paradee 1.1 · Heart · on-device"
              : "Edge · online")}
      </span>
      {!!(message || musicError || musicNotice || voicePreparing) && (
        <p className="audio-status" role="status">
          {message || musicError || musicNotice || "Preparing private voice…"}
        </p>
      )}
    </div>
  );
}
