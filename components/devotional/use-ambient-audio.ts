"use client";
import { useEffect, useState } from "react";
import {
  preloadAmbientLoop,
  startAmbientLoop,
  stopAmbientLoop,
} from "@/lib/audio/ambient-player";

// The pad is normalized to about −17 LUFS before the music slider and ducking.
const SOLO_GAIN = 0.48;
const SPEECH_GAIN = 0.34;
const musicError = "Music could not start. Tap the music button to try again.";

export function useAmbientAudio(
  enabled: boolean,
  narration: "idle" | "loading" | "playing" | "paused",
  level = 0.5,
) {
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const volumeScale = Math.max(0, Math.min(1, level)) / 0.5;
  const voiceActive = narration === "playing" || narration === "loading";
  const wanted = enabled && (playing || voiceActive);
  const volume =
    (narration === "playing" ? SPEECH_GAIN : SOLO_GAIN) * volumeScale;

  useEffect(() => {
    if (enabled) void preloadAmbientLoop().catch(() => {});
  }, [enabled]);

  useEffect(() => {
    // Keep the loop running across section changes and after narration ends.
    if (enabled && voiceActive) setPlaying(true);
  }, [enabled, voiceActive]);

  useEffect(() => {
    if (!wanted) return;
    let alive = true;
    const sync = () => {
      void startAmbientLoop(volume).then(
        () => {
          if (alive) setError("");
        },
        () => {
          if (alive) setError(musicError);
        },
      );
    };
    sync();
    const resume = () => {
      if (document.visibilityState === "visible") sync();
    };
    document.addEventListener("visibilitychange", resume);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", resume);
    };
  }, [wanted, volume]);

  useEffect(() => () => stopAmbientLoop(), []);

  function start(withVoice: boolean) {
    // Unlock Web Audio in the same gesture as Listen or Play.
    setPlaying(true);
    setError("");
    void startAmbientLoop(
      (withVoice ? SPEECH_GAIN : SOLO_GAIN) * volumeScale,
    ).catch(() => {});
  }

  function stop() {
    stopAmbientLoop();
    setPlaying(false);
    setError("");
  }

  return { playing: wanted, start, stop, error };
}
