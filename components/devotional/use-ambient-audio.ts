"use client";
import { useEffect } from "react";
import {
  setAmbientVolume,
  startAmbientLoop,
  stopAmbientLoop,
} from "@/lib/audio/ambient-player";
const ACTIVE_VOLUME = 0.3;
const DUCKED_VOLUME = 0.16;
export function useAmbientAudio(
  enabled: boolean,
  voiceActive: boolean,
  volumeScale = 1,
) {
  useEffect(() => {
    if (!enabled) {
      // Keep the same source through the brief idle frame between sections.
      const timer = setTimeout(stopAmbientLoop, 180);
      return () => clearTimeout(timer);
    }
    const volume = (voiceActive ? DUCKED_VOLUME : ACTIVE_VOLUME) * volumeScale;
    void startAmbientLoop(volume).catch(() => {});
    setAmbientVolume(volume);
    const resume = () => {
      if (document.visibilityState === "visible")
        void startAmbientLoop(volume).catch(() => {});
    };
    document.addEventListener("visibilitychange", resume);
    return () => document.removeEventListener("visibilitychange", resume);
  }, [enabled, voiceActive, volumeScale]);
  useEffect(() => () => stopAmbientLoop(), []);
}
export async function primeAmbientFromGesture(enabled: boolean) {
  if (enabled) await startAmbientLoop(DUCKED_VOLUME).catch(() => {});
}
