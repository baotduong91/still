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
import { supportsMp3Stream, streamMp3 } from "@/lib/tts/edge-stream";
import { kokoroAudio } from "@/lib/tts/kokoro-client";
type Status = "idle" | "loading" | "playing" | "paused";
export function useReadingAudio(payload: ReadingPayload) {
  const { state, online } = useApp(),
    id = useId(),
    path = usePathname();
  const [status, setStatus] = useState<Status>("idle"),
    [engine, setEngine] = useState(""),
    [message, setMessage] = useState(""),
    [speed, setSpeed] = useState(1),
    [completed, setCompleted] = useState(0);
  const audio = useRef<HTMLAudioElement | null>(null),
    url = useRef<string | null>(null),
    abort = useRef<AbortController | null>(null),
    device = useRef(false);
  const edgeFiles = useRef(new Map<string, Blob>());
  useEffect(() => () => edgeFiles.current.clear(), []);
  const generation = useRef(0),
    speedRef = useRef(speed),
    paused = useRef(false),
    resumeChunk = useRef<(() => void) | null>(null),
    started = useRef(false);
  speedRef.current = speed;
  const input = { text: payload.text, reference: payload.reference },
    spoken = buildSpokenText(payload);
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
    paused.current = false;
    resumeChunk.current?.();
    resumeChunk.current = null;
    started.current = false;
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
    // Populate installed voices early without speaking or sending any text.
    window.speechSynthesis?.getVoices();
    const other = (event: Event) => {
      if ((event as CustomEvent).detail !== id) stop();
    };
    window.addEventListener(readingAudioEvent, other);
    return () => {
      window.removeEventListener(readingAudioEvent, other);
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, id]);
  function startDevice(notice: string) {
    if (!spoken.trim()) return;
    const token = generation.current;
    const voices =
      window.speechSynthesis
        ?.getVoices()
        .filter((v) => v.localService && /^en[-_]/i.test(v.lang)) ?? [];
    const voice =
      voices.find((v) =>
        /samantha|jenny|aria|susan|zira|female|karen|moira/i.test(v.name),
      ) ?? voices[0];
    if (!voice) {
      setStatus("idle");
      setMessage(
        "No installed English voice is available. Install an on-device voice in your device’s speech settings, or download Bella here while online.",
      );
      return;
    }
    const utterance = new SpeechSynthesisUtterance(spoken);
    utterance.voice = voice;
    utterance.rate = speedRef.current;
    device.current = true;
    utterance.onend = () => {
      if (generation.current === token) {
        device.current = false;
        setStatus("idle");
        setCompleted((n) => n + 1);
      }
    };
    utterance.onerror = () => {
      if (generation.current === token) {
        device.current = false;
        setStatus("idle");
        setMessage(
          "The installed voice could not read this content. You can keep reading here.",
        );
      }
    };
    setEngine(`Device voice · ${voice.name}`);
    setMessage(notice);
    setStatus("playing");
    speechSynthesis.speak(utterance);
  }
  function playDevice() {
    window.dispatchEvent(new CustomEvent(readingAudioEvent, { detail: id }));
    stop();
    startDevice(
      "Using an installed voice. No download and no text sent online.",
    );
  }
  async function play() {
    if (!spoken.trim()) return;
    if (status === "playing") {
      paused.current = true;
      if (device.current) speechSynthesis.pause();
      else audio.current?.pause();
      setStatus("paused");
      return;
    }
    if (status === "paused") {
      const token = generation.current;
      try {
        paused.current = false;
        if (device.current) speechSynthesis.resume();
        else if (audio.current) await audio.current.play();
        resumeChunk.current?.();
        resumeChunk.current = null;
        if (token === generation.current) {
          started.current = true;
          setStatus("playing");
          setMessage("");
        }
      } catch {
        if (token === generation.current) {
          paused.current = true;
          setMessage("Tap Play again to continue, or Stop to start fresh.");
        }
      }
      return;
    }
    if (preferredEngine === "device") {
      playDevice();
      return;
    }
    window.dispatchEvent(new CustomEvent(readingAudioEvent, { detail: id }));
    stop();
    const token = ++generation.current,
      controller = new AbortController();
    abort.current = controller;
    const alive = () =>
      generation.current === token && !controller.signal.aborted;
    setStatus("loading");
    async function playBlob(blob: Blob, stream = false) {
      if (!alive()) return;
      if (stream && paused.current)
        await new Promise<void>((resolve) => {
          resumeChunk.current = resolve;
        });
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
      let finish = () => {},
        fail = (_error: Error) => {};
      const ended = stream
        ? new Promise<void>((resolve, reject) => {
            finish = resolve;
            fail = reject;
          })
        : Promise.resolve();
      // An error may precede play() settling; attach a handler immediately.
      void ended.catch(() => {});
      const cancelled = () => finish();
      if (stream)
        controller.signal.addEventListener("abort", cancelled, { once: true });
      player.onended = () => {
        if (stream) {
          if (audio.current === player) audio.current = null;
          finish();
        } else if (alive()) {
          setStatus("idle");
          setCompleted((n) => n + 1);
        }
      };
      player.onerror = () => {
        if (stream) fail(new Error("Audio playback failed"));
        else if (alive()) {
          setStatus("idle");
          setMessage(
            "This audio could not play. Try the installed device voice.",
          );
        }
      };
      try {
        try {
          await player.play();
          if (alive()) {
            started.current = true;
            setStatus("playing");
          }
        } catch (error) {
          if ((error as Error).name === "NotAllowedError") {
            if (alive()) {
              paused.current = true;
              setStatus("paused");
              setMessage("Your audio is ready. Tap Play to listen.");
            }
          } else throw error;
        }
        if (stream) await ended;
      } finally {
        controller.signal.removeEventListener("abort", cancelled);
      }
    }
    try {
      if (preferredEngine === "edge") {
        setEngine("Edge · Jenny");
        setMessage("Preparing a clear, gentle reading…");
        try {
          const cacheKey = JSON.stringify(input);
          const saved = edgeFiles.current.get(cacheKey);
          if (saved) {
            setMessage("");
            await playBlob(saved);
            return;
          }
          const candidate = new Audio();
          const canStream =
            candidate instanceof HTMLMediaElement && supportsMp3Stream();
          const response = await fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...input,
              voice: "en-US-JennyNeural",
              rate: 1,
              ...(canStream ? { stream: true } : {}),
            }),
            signal: controller.signal,
          });
          if (
            !response.ok ||
            !response.headers.get("Content-Type")?.includes("audio/")
          )
            throw new Error();
          if (canStream && alive()) {
            audio.current = candidate;
            candidate.playbackRate = speedRef.current;
            candidate.onended = () => {
              if (alive()) {
                setStatus("idle");
                setCompleted((n) => n + 1);
              }
            };
            candidate.onerror = () => {
              if (alive() && (started.current || paused.current)) {
                stop();
                setMessage(
                  "The reading was interrupted. Tap Play to retry or use an installed voice.",
                );
              }
            };
            const file = await streamMp3(
              response,
              candidate,
              controller.signal,
              {
                url: (href) => {
                  url.current = href;
                },
                playing: () => {
                  if (alive()) {
                    started.current = true;
                    setMessage("");
                    setStatus("playing");
                  }
                },
                blocked: () => {
                  if (alive()) {
                    paused.current = true;
                    setStatus("paused");
                    setMessage("Your audio is ready. Tap Play to listen.");
                  }
                },
              },
            );
            if (alive()) {
              while (edgeFiles.current.size >= 2)
                edgeFiles.current.delete(
                  edgeFiles.current.keys().next().value!,
                );
              edgeFiles.current.set(cacheKey, file);
            }
            return;
          }
          const blob = await response.blob();
          if (!blob.size) throw new Error();
          if (alive()) {
            while (edgeFiles.current.size >= 2)
              edgeFiles.current.delete(edgeFiles.current.keys().next().value!);
            edgeFiles.current.set(cacheKey, blob);
            setMessage("");
            await playBlob(blob);
          }
          return;
        } catch {
          if (!alive()) return;
          if (started.current) {
            stop();
            setMessage(
              "The reading was interrupted. Tap Play to retry or use an installed voice.",
            );
            return;
          }
          setMessage("Edge is unavailable. Preparing the on-device voice…");
        }
      }
      if (!alive()) return;
      setEngine("Kokoro · Bella");
      if (!online) setMessage("Loading your downloaded voice…");
      let playback = Promise.resolve(),
        playbackError: unknown,
        streamed = false;
      try {
        const result = await kokoroAudio(
          spoken,
          (s) => {
            if (alive() && !started.current) setMessage(s);
          },
          controller.signal,
          (blob, backend) => {
            if (!alive()) return;
            streamed = true;
            setEngine(`Kokoro · Bella · ${backend}`);
            playback = playback
              .then(async () => {
                if (alive() && !playbackError) {
                  setMessage("");
                  await playBlob(blob, true);
                }
              })
              .catch((error) => {
                playbackError = error;
                if (alive()) {
                  stop();
                  setMessage(
                    "This audio could not play. Use the installed device voice to restart the reading.",
                  );
                }
              });
          },
        );
        if (result.blob && alive()) {
          setEngine(`Kokoro · Bella · ${result.backend}`);
          setMessage("");
          await playBlob(result.blob);
          return;
        }
        if (!streamed) throw new Error("No audio was generated");
        await playback;
        if (playbackError) throw playbackError;
        if (alive() && streamed) {
          setStatus("idle");
          setCompleted((n) => n + 1);
          setMessage("");
        }
      } catch {
        if (!alive()) return;
        const hadSound = started.current;
        stop();
        if (hadSound)
          setMessage(
            "Bella could not finish this reading. Use device voice to restart immediately, or tap Play to try again.",
          );
        else
          startDevice(
            "Bella took too long or could not load. Using an installed voice; your text stays on-device.",
          );
      }
    } catch {
      if (alive()) {
        stop();
        setMessage(
          "Audio is unavailable right now. Try the installed device voice, or download Bella in Settings.",
        );
      }
    }
  }
  return {
    status,
    completed,
    engine,
    message,
    speed,
    play,
    stop,
    playDevice,
    preferredEngine,
    empty: !spoken.trim(),
    changeSpeed(rate: number) {
      setSpeed(rate);
      if (audio.current) audio.current.playbackRate = rate;
      if (device.current) stop();
    },
  };
}
