"use client";
import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useApp } from "@/components/provider";
import {
  buildSpokenText,
  engineForKind,
  readingAudioEvent,
  type ReadingPayload,
} from "@/lib/tts/reading";
import { kokoroAudio } from "@/lib/tts/kokoro-client";
type Status = "idle" | "loading" | "playing" | "paused";
export function useReadingAudio(payload: ReadingPayload) {
  const { state, online } = useApp();
  const id = useId();
  const [status, setStatus] = useState<Status>("idle"),
    [engine, setEngine] = useState(""),
    [message, setMessage] = useState("");
  const [speed, setSpeed] = useState(1);
  const audio = useRef<HTMLAudioElement | null>(null),
    url = useRef<string | null>(null),
    abort = useRef<AbortController | null>(null),
    device = useRef(false);
  const generation = useRef(0),
    speedRef = useRef(speed);
  speedRef.current = speed;
  const path = usePathname();
  const input = { text: payload.text, reference: payload.reference };
  const spoken = buildSpokenText(payload);
  const preferredEngine = engineForKind(
    payload.kind,
    state.speechEngine,
    online,
  );
  const signature = JSON.stringify([payload, state.speechEngine, path]);
  function stop() {
    generation.current++;
    abort.current?.abort();
    abort.current = null;
    if (audio.current) {
      audio.current.pause();
      audio.current.removeAttribute("src");
      audio.current.load();
      audio.current = null;
    }
    if (url.current) {
      URL.revokeObjectURL(url.current);
      url.current = null;
    }
    if (device.current) {
      window.speechSynthesis?.cancel();
      device.current = false;
    }
    setStatus("idle");
    setEngine("");
    setMessage("");
  }
  useEffect(() => {
    const other = (event: Event) => {
      if ((event as CustomEvent).detail !== id) stop();
    };
    window.addEventListener(readingAudioEvent, other);
    return () => {
      window.removeEventListener(readingAudioEvent, other);
      stop();
    };
    // Stop on verse/translation/provider changes, navigation and PIN boundary unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, id]);
  async function play() {
    if (!spoken.trim()) return;
    if (status === "playing") {
      if (device.current) speechSynthesis.pause();
      else audio.current?.pause();
      setStatus("paused");
      return;
    }
    if (status === "paused") {
      const token = generation.current;
      try {
        if (device.current) speechSynthesis.resume();
        else await audio.current?.play();
        if (token === generation.current) {
          setStatus("playing");
          setMessage("");
        }
      } catch {
        if (token === generation.current)
          setMessage("Tap Play again to continue, or Stop to start fresh.");
      }
      return;
    }
    window.dispatchEvent(new CustomEvent(readingAudioEvent, { detail: id }));
    stop();
    const token = ++generation.current;
    const controller = new AbortController();
    abort.current = controller;
    const alive = () =>
      generation.current === token && !controller.signal.aborted;
    setStatus("loading");
    async function playBlob(blob: Blob) {
      if (!alive()) return;
      if (audio.current) {
        audio.current.pause();
        audio.current.removeAttribute("src");
      }
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = URL.createObjectURL(blob);
      const player = new Audio(url.current);
      audio.current = player;
      player.playbackRate = speedRef.current;
      player.onended = () => {
        if (alive()) setStatus("idle");
      };
      player.onerror = () => {
        if (alive()) {
          setStatus("idle");
          setMessage(
            "This audio could not play. Tap Play to try again, or choose Kokoro in Settings.",
          );
        }
      };
      try {
        await player.play();
        if (alive()) setStatus("playing");
      } catch (error) {
        if ((error as Error).name === "NotAllowedError") {
          if (alive()) {
            setStatus("paused");
            setMessage("Your audio is ready. Tap Play to listen.");
          }
        } else throw error;
      }
    }
    try {
      if (engineForKind(payload.kind, state.speechEngine, online) === "edge") {
        setEngine("Edge · Jenny");
        setMessage("Preparing a clear, gentle reading…");
        try {
          const response = await fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...input,
              voice: "en-US-JennyNeural",
              rate: 1,
            }),
            signal: controller.signal,
          });
          if (
            !response.ok ||
            !response.headers.get("Content-Type")?.includes("audio/")
          )
            throw new Error();
          const blob = await response.blob();
          if (!blob.size) throw new Error();
          if (alive()) {
            setMessage("");
            await playBlob(blob);
          }
          return;
        } catch {
          if (!alive()) return;
          setMessage("Edge is unavailable. Preparing the on-device voice…");
        }
      }
      if (!alive()) return;
      setEngine("Kokoro · Bella");
      if (!online) setMessage("Looking for your downloaded on-device voice…");
      try {
        const result = await kokoroAudio(
          spoken,
          (s) => {
            if (alive()) setMessage(s);
          },
          controller.signal,
        );
        if (alive() && result.blob) {
          setEngine(`Kokoro · Bella · ${result.backend}`);
          setMessage("");
          await playBlob(result.blob);
        }
        return;
      } catch {
        if (!alive()) return;
      }
      // Never use an OS cloud voice as a silent fallback from private/offline reading.
      const voices =
        window.speechSynthesis
          ?.getVoices()
          .filter((v) => v.localService && /^en[-_]/i.test(v.lang)) ?? [];
      const voice =
        voices.find((v) =>
          /samantha|jenny|aria|susan|zira|female|karen|moira/i.test(v.name),
        ) ?? voices[0];
      if (!voice) throw new Error();
      device.current = true;
      const utterance = new SpeechSynthesisUtterance(spoken);
      utterance.voice = voice;
      utterance.rate = speedRef.current;
      utterance.onend = () => {
        if (alive()) {
          device.current = false;
          setStatus("idle");
        }
      };
      utterance.onerror = () => {
        if (alive()) {
          device.current = false;
          setStatus("idle");
          setMessage(
            "The device voice could not read this passage. You can keep reading here.",
          );
        }
      };
      setEngine("Device voice · on-device");
      setMessage(
        "Kokoro isn’t ready. Using an installed device voice. Download Bella in Settings for the natural offline voice.",
      );
      speechSynthesis.speak(utterance);
      setStatus("playing");
    } catch {
      if (alive()) {
        setStatus("idle");
        setMessage(
          "Audio is unavailable right now. Connect once and download the on-device voice in Settings. You can keep reading here.",
        );
      }
    }
  }
  return {
    status,
    engine,
    message,
    speed,
    play,
    stop,
    preferredEngine,
    empty: !spoken.trim(),
    changeSpeed(rate: number) {
      setSpeed(rate);
      if (audio.current) audio.current.playbackRate = rate;
      if (device.current) stop();
    },
  };
}
