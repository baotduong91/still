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
import {
  bellaSessionPrepared,
  bellaBackend,
  kokoroAudio,
  primeKokoro,
  preparedKokoro,
  KokoroTimeoutError,
} from "@/lib/tts/kokoro-client";
import { ChunkScheduler } from "@/lib/tts/chunk-playback";
import { offlineModelStored } from "@/lib/tts/model-cache";
type Status = "idle" | "loading" | "playing" | "paused";
function playbackIdentity(payload: ReadingPayload) {
  return payload.kind === "scripture"
    ? { kind: payload.kind, reference: payload.reference }
    : payload;
}
export function useReadingAudio(
  payload: ReadingPayload,
  options?: { licensedTextPending?: boolean },
) {
  const { state, online } = useApp(),
    id = useId(),
    path = usePathname();
  const [status, setStatus] = useState<Status>("idle"),
    [engine, setEngine] = useState(""),
    [message, setMessage] = useState(""),
    [speed, setSpeed] = useState(1),
    [completed, setCompleted] = useState(0),
    [canKeepWaiting, setCanKeepWaiting] = useState(false);
  const extendWait = useRef<(() => void) | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null),
    url = useRef<string | null>(null),
    abort = useRef<AbortController | null>(null),
    device = useRef(false);
  const nextAudio = useRef<{
    text: string;
    blob: Blob;
    player: HTMLAudioElement;
    url: string;
  } | null>(null);
  const preparationEpoch = useRef(0);
  function clearPrepared() {
    preparationEpoch.current++;
    const next = nextAudio.current;
    nextAudio.current = null;
    if (next) {
      next.player.pause();
      next.player.removeAttribute("src");
      next.player.load();
      URL.revokeObjectURL(next.url);
    }
  }
  async function prepareNext(next: ReadingPayload, allowDownload = false) {
    // Lookahead is strictly local; it never requests Edge or another cloud voice.
    if (engineForKind(next.kind, state.speechEngine, online) !== "kokoro")
      return false;
    const text = buildSpokenText(next);
    if (nextAudio.current?.text === text) return true;
    clearPrepared();
    const epoch = preparationEpoch.current;
    if (
      !(await primeKokoro(text, false).catch(() => false)) ||
      epoch !== preparationEpoch.current
    )
      return false;
    const blob = preparedKokoro(text);
    if (!blob) return false;
    const href = URL.createObjectURL(blob);
    const player = new Audio(href);
    player.preload = "auto";
    player.load();
    nextAudio.current = { text, blob, player, url: href };
    return true;
  }
  useEffect(() => () => clearPrepared(), [path, state.speechEngine]);
  const edgeFiles = useRef(new Map<string, Blob>());
  useEffect(() => () => edgeFiles.current.clear(), []);
  const generation = useRef(0),
    speedRef = useRef(speed),
    paused = useRef(false),
    resumeChunk = useRef<(() => void) | null>(null),
    started = useRef(false),
    scheduler = useRef<ChunkScheduler | null>(null);
  speedRef.current = speed;
  const input = { text: payload.text, reference: payload.reference },
    spoken = buildSpokenText(payload);
  const preferredEngine = engineForKind(
    payload.kind,
    state.speechEngine,
    online,
  );
  const playbackKey = JSON.stringify([
    playbackIdentity(payload),
    state.speechEngine,
    path,
  ]);
  const licensedPending = useRef(options?.licensedTextPending);
  licensedPending.current = options?.licensedTextPending;
  function stop() {
    generation.current++;
    extendWait.current = null;
    setCanKeepWaiting(false);
    abort.current?.abort();
    abort.current = null;
    paused.current = false;
    resumeChunk.current?.();
    resumeChunk.current = null;
    started.current = false;
    scheduler.current?.stop();
    scheduler.current = null;
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
  }, [playbackKey, id]);
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
    if (licensedPending.current && payload.kind === "scripture") {
      setStatus("idle");
      setMessage("Loading licensed Scripture…");
      return;
    }
    if (status === "playing") {
      paused.current = true;
      if (device.current) speechSynthesis.pause();
      else if (scheduler.current) scheduler.current.pause();
      else audio.current?.pause();
      setStatus("paused");
      return;
    }
    if (status === "paused") {
      const token = generation.current;
      try {
        paused.current = false;
        if (device.current) speechSynthesis.resume();
        else if (scheduler.current) scheduler.current.resume();
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
      const ready = nextAudio.current?.blob === blob ? nextAudio.current : null;
      if (ready) nextAudio.current = null;
      url.current = ready?.url ?? URL.createObjectURL(blob);
      const player = ready?.player ?? new Audio(url.current);
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
        async function edgeBuffered() {
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
          if (!alive()) return;
          while (edgeFiles.current.size >= 2)
            edgeFiles.current.delete(edgeFiles.current.keys().next().value!);
          edgeFiles.current.set(cacheKey, blob);
          setMessage("");
          await playBlob(blob);
        }
        function clearEdgeStream() {
          started.current = false;
          if (audio.current === candidate) {
            candidate.pause();
            candidate.removeAttribute("src");
            candidate.load();
            audio.current = null;
          }
          if (url.current) {
            URL.revokeObjectURL(url.current);
            url.current = null;
          }
        }
        try {
          if (canStream) {
            try {
              const response = await fetch("/api/tts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  ...input,
                  voice: "en-US-JennyNeural",
                  rate: 1,
                  stream: true,
                }),
                signal: controller.signal,
              });
              if (
                !response.ok ||
                !response.headers.get("Content-Type")?.includes("audio/")
              )
                throw new Error();
              if (!alive()) return;
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
            } catch {
              if (!alive()) return;
              clearEdgeStream();
              setMessage("Preparing a clear, gentle reading…");
              await edgeBuffered();
              return;
            }
          }
          await edgeBuffered();
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
      const ready = preparedKokoro(spoken);
      if (ready) {
        setMessage("");
        setEngine(`Kokoro · Bella · ${bellaBackend()}`);
        await playBlob(ready);
        return;
      }
      const stored = await offlineModelStored().catch(() => false);
      if (stored) {
        setMessage(
          bellaSessionPrepared()
            ? "Loading Bella on this device…"
            : "Warming Bella for private reading…",
        );
      } else {
        setStatus("idle");
        setMessage(
          "Download Bella in Settings → Reading voice before private listening. This is a one-time setup while browser storage is retained.",
        );
        return;
      }
      if (!alive()) return;
      setMessage("Preparing a continuous Bella reading on-device…");
      let playbackError: unknown,
        streamed = false;
      const kokoroPlayback = new ChunkScheduler(speedRef.current, true);
      scheduler.current = kokoroPlayback;
      const kokoroOptions = {
        onWaiting: (text: string) => {
          if (alive() && !started.current) setMessage(text);
        },
        onTimeout: (extend: () => void) => {
          if (!alive()) return;
          if (started.current) {
            stop();
            setMessage(
              "Bella could not finish this reading. Use device voice to restart immediately, or tap Play to try again.",
            );
            return;
          }
          extendWait.current = extend;
          setCanKeepWaiting(true);
          setMessage(
            "Bella still needs more time. Keep waiting to continue this same reading, or choose a device voice.",
          );
        },
      };
      // Retry one genuine worker/model error before offering an explicit choice.
      // Timeouts auto-extend several times; they never switch to a device voice.
      for (let attempt = 0; attempt < 2; attempt++)
        try {
          const result = await kokoroAudio(
            spoken,
            (s) => {
              if (alive() && !started.current) setMessage(s);
            },
            controller.signal,
            (blob, backend) => {
              if (!alive()) return;
              extendWait.current = null;
              setCanKeepWaiting(false);
              streamed = true;
              setEngine(`Kokoro · Bella · ${backend}`);
              void kokoroPlayback
                .append(blob, () => {
                  if (alive()) {
                    setMessage("");
                    started.current = true;
                    setStatus("playing");
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
            kokoroOptions,
          );
          if (result.blob && alive()) {
            extendWait.current = null;
            setCanKeepWaiting(false);
            setEngine(`Kokoro · Bella · ${result.backend}`);
            setMessage("");
            await playBlob(result.blob);
            return;
          }
          if (!streamed) throw new Error("No audio was generated");
          if (playbackError) throw playbackError;
          await kokoroPlayback.drain();
          if (alive() && streamed) {
            scheduler.current = null;
            setStatus("idle");
            setCompleted((n) => n + 1);
            setMessage("");
          }
          return;
        } catch (error) {
          if (!alive()) return;
          const hadSound = started.current || streamed;
          if (
            !hadSound &&
            !(error instanceof KokoroTimeoutError) &&
            attempt === 0
          ) {
            setMessage(
              "Bella couldn’t prepare this attempt. Retrying once on-device…",
            );
            continue;
          }
          stop();
          if (hadSound)
            setMessage(
              "Bella could not finish this reading. Use device voice to restart immediately, or tap Play to try again.",
            );
          else
            setMessage(
              error instanceof KokoroTimeoutError
                ? "Bella could not finish in time. Tap Play once more to continue on-device, or choose Use device voice."
                : "Bella could not load after a retry. Tap Play to try Bella again, or choose Use device voice. Your text stays on-device.",
            );
          return;
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
    canKeepWaiting,
    keepWaiting() {
      const extend = extendWait.current;
      if (!extend) return;
      extendWait.current = null;
      setCanKeepWaiting(false);
      setMessage(
        "Still preparing Bella on-device. Allowing more time for this first reading…",
      );
      extend();
    },
    preferredEngine,
    prepareNext,
    clearPrepared,
    empty: !spoken.trim(),
    changeSpeed(rate: number) {
      setSpeed(rate);
      if (audio.current) audio.current.playbackRate = rate;
      scheduler.current?.setRate(rate);
      if (device.current) stop();
    },
  };
}
