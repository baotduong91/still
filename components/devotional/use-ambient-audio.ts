"use client";
import { useEffect, useState } from "react";
import { startAmbientLoop, stopAmbientLoop } from "@/lib/audio/ambient-player";
/** Tuned for Angelic Pad Loop @ −17 LUFS; music slider 0.5 scales both gains. */
const ACTIVE_VOLUME = 0.42;
/** Background level while narration is playing. */
const DUCKED_VOLUME = 0.18;
export function useAmbientAudio(
  enabled: boolean,
  voiceActive: boolean,
  volumeScale = 1,
) {
  const [error, setError] = useState("");
  useEffect(() => {
    if (!enabled) {
      setError("");
      // Keep the same source through the brief idle frame between sections.
      const timer = setTimeout(stopAmbientLoop, 180);
      return () => clearTimeout(timer);
    }
    const volume = (voiceActive ? DUCKED_VOLUME : ACTIVE_VOLUME) * volumeScale;
    let alive = true;
    setError("");
    const start = () =>
      startAmbientLoop(volume).catch(() => {
        if (alive)
          setError("Music could not start. Tap the music button to try again.");
      });
    void start();
    const resume = () => {
      if (document.visibilityState === "visible") void start();
    };
    document.addEventListener("visibilitychange", resume);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", resume);
    };
  }, [enabled, voiceActive, volumeScale]);
  useEffect(() => () => stopAmbientLoop(), []);
  return error;
}
export async function primeAmbientFromGesture(
  enabled: boolean,
  volumeScale = 1,
  voiceActive = true,
) {
  if (enabled)
    await startAmbientLoop(
      (voiceActive ? DUCKED_VOLUME : ACTIVE_VOLUME) * volumeScale,
    );
}
