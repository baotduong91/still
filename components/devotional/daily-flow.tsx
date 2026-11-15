"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUpRight,
  BookOpen,
  Check,
  Share2,
  X,
  MoreHorizontal,
  Maximize2,
} from "lucide-react";
import Link from "@/components/smart-link";
import { usePrivacy } from "@/components/privacy";
import { useApp } from "@/components/provider";
import { Button } from "@/components/ui/button";
import { TodayAudioDock } from "./today-audio-dock";
import { useReadingAudio } from "@/components/scripture/use-reading-audio";
import { usePassage } from "@/components/scripture/use-passage";
import { devotionReflectionText, type ReadingPayload } from "@/lib/tts/reading";
import { verseSpeech } from "@/lib/tts/shared";
import {
  privateVoice,
  clearPrivatePreviews,
  downloadPrivateVoice,
} from "@/lib/tts/private-voice";
import type { PassageType, DayType, PlanType } from "@/lib/schemas";
import { PracticeWriter } from "./practice-writer";
import { PrayerWriter } from "./prayer-writer";

const sections = ["Scripture", "Reflection", "Prayer", "Practice"];
const anchors = [
  "today-scripture",
  "today-reflection",
  "today-prayer",
  "today-practice",
];
export function DailyFlow({
  localPassage,
  plan,
  day,
  busy,
  onComplete,
}: {
  localPassage: PassageType;
  plan: PlanType;
  day: DayType;
  busy: boolean;
  onComplete: () => Promise<void>;
}) {
  const { state, online, update } = useApp();
  const { lock } = usePrivacy();
  const voice = privateVoice(state.speechEngine);
  const { passage, resolving: passageResolving } = usePassage(localPassage);
  const [active, setActive] = useState(0);
  const [immersive, setImmersive] = useState(true);
  useEffect(() => {
    document.body.classList.toggle("still-listening", immersive);
    return () => document.body.classList.remove("still-listening");
  }, [immersive]);
  const [autoplay, setAutoplay] = useState(true);
  const autoplayTarget = useRef<number | null>(null);
  const latestReader = useRef<ReturnType<typeof useReadingAudio> | null>(null);
  const [privateReady, setPrivateReady] = useState(false);
  const [needsVoiceDownload, setNeedsVoiceDownload] = useState(false);
  const [voicePreparing, setVoicePreparing] = useState(false);
  const voicePrepare = useRef<AbortController | null>(null);
  const refs = useRef<(HTMLElement | null)[]>([]),
    lockScroll = useRef(0),
    consumed = useRef(0);
  const payloads: ReadingPayload[] = [
    { kind: "scripture", ...verseSpeech(passage) },
    {
      kind: "devotional",
      text: devotionReflectionText(day),
      title: day.title,
    },
    { kind: "prayer", text: day.prayer, title: day.title },
    { kind: "action", text: day.action, title: day.title },
  ];
  const reader = useReadingAudio(payloads[active], {
    licensedTextPending: active === 0 && passageResolving,
  });
  latestReader.current = reader;
  useEffect(() => {
    const linked = anchors.indexOf(window.location.hash.slice(1));
    if (linked >= 0) {
      setActive(linked);
      refs.current[linked]?.scrollIntoView({
        block: "start",
        behavior: "instant",
      });
    }
  }, []);
  function go(index: number, automatic = false) {
    if (!automatic) autoplayTarget.current = null;
    lockScroll.current = performance.now() + 700;
    setActive(index);
    const section = refs.current[index];
    section?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    section?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "start",
    });
  }
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      if (performance.now() < lockScroll.current) {
        frame = requestAnimationFrame(measure);
        return;
      }
      const line = Math.min(window.innerHeight * 0.38, 320);
      let next = 0;
      refs.current.forEach((section, i) => {
        if (section && section.getBoundingClientRect().top <= line) next = i;
      });
      setActive(next);
    };
    const scroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const observer = new IntersectionObserver(scroll, {
      threshold: [0, 0.15, 0.4, 0.7],
    });
    refs.current.forEach((section) => {
      if (section) observer.observe(section);
    });
    window.addEventListener("scroll", scroll, { passive: true });
    window.addEventListener("resize", scroll);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", scroll);
      window.removeEventListener("resize", scroll);
    };
  }, []);
  useEffect(() => {
    if (reader.completed <= consumed.current) return;
    consumed.current = reader.completed;
    if (active < 3) {
      autoplayTarget.current = autoplay ? active + 1 : null;
      go(active + 1, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reader.completed]);
  useEffect(() => {
    if (!autoplay || autoplayTarget.current !== active) {
      autoplayTarget.current = null;
      return;
    }
    const frame = requestAnimationFrame(() => {
      if (autoplayTarget.current !== active) return;
      autoplayTarget.current = null;
      if (state.todayVoiceOn !== false) void latestReader.current?.play();
    });
    return () => cancelAnimationFrame(frame);
  }, [active, autoplay, state.todayVoiceOn]);
  const playerReader = {
    ...reader,
    stop() {
      autoplayTarget.current = null;
      reader.stop();
    },
    play() {
      autoplayTarget.current = null;
      return reader.play();
    },
  };
  const warmSignature = JSON.stringify([
    devotionReflectionText(day),
    day.prayer,
    day.action,
    state.speechEngine,
  ]);
  useEffect(() => {
    let alive = true;
    setPrivateReady(false);
    setNeedsVoiceDownload(false);
    const timer = setTimeout(async () => {
      if (state.speechEngine === "device") return;
      // Warm the server runtime without sending any verse or personal text.
      if (online && ["edge", "paradee"].includes(state.speechEngine))
        void fetch("/api/tts", { method: "HEAD", cache: "no-store" }).catch(
          () => {},
        );
      let stored = await voice.stored().catch(() => false);
      if (!alive) return;
      if (!stored && online) {
        voicePrepare.current?.abort();
        const controller = new AbortController();
        voicePrepare.current = controller;
        setVoicePreparing(true);
        setNeedsVoiceDownload(true);
        try {
          const prepared = await downloadPrivateVoice(
            state.speechEngine,
            controller.signal,
          );
          stored = prepared.stored;
        } catch {
          stored = false;
        } finally {
          if (voicePrepare.current === controller) voicePrepare.current = null;
          if (alive) setVoicePreparing(false);
        }
      }
      if (!alive) return;
      setNeedsVoiceDownload(!stored);
      if (stored) {
        const ready = await latestReader.current?.prepareNext(
          payloads[1],
          false,
        );
        if (alive) setPrivateReady(!!ready);
      }
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
      voicePrepare.current?.abort();
      voicePrepare.current = null;
      latestReader.current?.clearPrepared();
      clearPrivatePreviews();
    };
    // Only app-owned day copy is primed, using previously downloaded model files.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warmSignature, online]);
  // Prepare as soon as a section is selected, rather than waiting for its final
  // words. Only the immediate successor competes for the serial WASM worker.
  useEffect(() => {
    if (active >= 3 || state.speechEngine === "device") return;
    if (active > 0 && (!autoplay || reader.status !== "playing")) return;
    let alive = true;
    setPrivateReady(false);
    void (async () => {
      const stored = await voice.stored().catch(() => false);
      if (!stored) return;
      if (!alive) return;
      const ready =
        (await latestReader.current?.prepareNext(
          payloads[active + 1],
          false,
        )) ?? false;
      if (alive) setPrivateReady(ready);
    })();
    return () => {
      alive = false;
    };
    // Payload changes are represented by warmSignature.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, autoplay, warmSignature, reader.status, online]);
  function next(index: number) {
    return (
      <Button
        className="flow-continue"
        variant="ghost"
        onClick={() => go(index)}
      >
        Continue to {sections[index].toLowerCase()} <ArrowDown size={16} />
      </Button>
    );
  }
  return (
    <div
      className={`daily-flow${immersive ? " is-immersive" : ""}`}
      data-section={active}
    >
      {immersive ? (
        <>
          <div className="still-scene" aria-hidden="true">
            <div className="still-scene-landscape" />
            <div className="still-scene-glow" />
            <div className="still-scene-dust" />
          </div>
          <header className="listening-header">
            <button
              type="button"
              aria-label="Leave immersive view"
              onClick={() => setImmersive(false)}
            >
              <X size={22} />
            </button>
            <span>
              STILL · DAY {day.number} OF {plan.days.length}
            </span>
            <details className="listening-menu">
              <summary aria-label="Listening options">
                <MoreHorizontal size={22} />
              </summary>
              <div>
                <Link href="/journey">My journey</Link>
                <Link href="/journal">Journal</Link>
                <Link href="/settings#reading-voice">Voice settings</Link>
                <label className="music-level-control">
                  Music level
                  <input
                    type="range"
                    aria-label="Background music level"
                    min="0"
                    max="1"
                    step="0.05"
                    value={state.todayMusicLevel ?? 0.5}
                    onChange={(event) => {
                      const level = Number(event.target.value);
                      void update((s) => ({ ...s, todayMusicLevel: level }));
                    }}
                  />
                </label>
                {state.pinLock && (
                  <button type="button" onClick={lock}>
                    Lock personal content
                  </button>
                )}
              </div>
            </details>
          </header>
        </>
      ) : (
        <button
          className="enter-listening"
          type="button"
          onClick={() => setImmersive(true)}
        >
          <Maximize2 size={16} /> Focus view
        </button>
      )}

      <nav className="flow-index" aria-label="Daily rhythm">
        {sections.map((label, i) => (
          <a
            key={label}
            href={`#${anchors[i]}`}
            aria-current={active === i ? "location" : undefined}
            onClick={(e) => {
              e.preventDefault();
              go(i);
            }}
          >
            <span>{String(i + 1).padStart(2, "0")}</span>
            {label}
          </a>
        ))}
      </nav>
      <section
        className="flow-section flow-verse"
        id={anchors[0]}
        ref={(el) => {
          refs.current[0] = el;
        }}
        aria-labelledby="verse-heading"
      >
        <div className="flow-verse-top">
          <span>YOUR DAILY RHYTHM</span>
          <span>
            Day {day.number} of {plan.days.length}
          </span>
        </div>
        <div className="flow-verse-copy">
          <p className="eyebrow">
            {passage.reference} · {passage.translation}
          </p>
          <h2 id="verse-heading" tabIndex={-1}>
            Scripture for today
          </h2>
          <blockquote>
            {passage.verses.map((v) => (
              <span key={v.verse}>
                <sup>{v.verse}</sup>
                {v.text}{" "}
              </span>
            ))}
          </blockquote>
          <p className="flow-verse-credit">
            {passage.attribution || "World English Bible · Public domain"}
          </p>
          {passage.fallback && (
            <p className="flow-translation-notice">{passage.notice}</p>
          )}
        </div>
        <div className="flow-verse-bottom">
          <Link
            href={`/scripture?ref=${encodeURIComponent(day.passage.reference)}`}
          >
            <BookOpen size={16} /> Read in context <ArrowUpRight size={14} />
          </Link>
          <Link
            href={`/create-image?${new URLSearchParams({ ref: passage.reference, translation: passage.requestedTranslation })}`}
          >
            <Share2 size={16} /> Create Image
          </Link>
          {next(1)}
        </div>
      </section>
      <section
        className="flow-section flow-reflection"
        id={anchors[1]}
        ref={(el) => {
          refs.current[1] = el;
        }}
        aria-labelledby="reflection-heading"
      >
        <div className="flow-section-label">
          <span>02</span> LET IT TAKE ROOT
        </div>
        <div className="devotional-prose">
          <h2 id="reflection-heading" tabIndex={-1}>
            {day.title}
          </h2>
          <p>{day.reflection}</p>
          <div className="question-box">
            {day.questions.map((q) => (
              <p key={q}>{q}</p>
            ))}
          </div>
          <p className="fine-print">{day.interpretation}</p>
          {voicePreparing && (
            <p className="fine-print" role="status">
              Preparing {voice.name} on this device for private listening…
            </p>
          )}
          {needsVoiceDownload && !voicePreparing && (
            <p className="fine-print">
              <Link href="/settings#reading-voice">
                Finish setting up {voice.name} in Settings for private reading.
              </Link>
            </p>
          )}
        </div>
        {next(2)}
      </section>
      <section
        className="flow-section flow-prayer"
        id={anchors[2]}
        ref={(el) => {
          refs.current[2] = el;
        }}
        aria-labelledby="prayer-heading"
      >
        <div className="flow-section-label">
          <span>03</span> A PRAYER FOR TODAY
        </div>
        <div className="devotional-prose">
          <h2 id="prayer-heading" tabIndex={-1}>
            Come as you are.
          </h2>
          <p className="prayer-text">{day.prayer}</p>
          <p className="fine-print">
            A personal prayer inspired by your reading; not Scripture.
          </p>
        </div>
        <details className="flow-personal-prayer">
          <summary>Write your own prayer</summary>
          <PrayerWriter />
        </details>
        {next(3)}
      </section>
      <section
        className="flow-section flow-practice"
        id={anchors[3]}
        ref={(el) => {
          refs.current[3] = el;
        }}
        aria-labelledby="practice-heading"
      >
        <div className="flow-section-label">
          <span>04</span> ONE SMALL, FAITHFUL STEP
        </div>
        <div className="devotional-prose">
          <h2 id="practice-heading" tabIndex={-1}>
            Carry it into your day.
          </h2>
          <p>{day.action}</p>
        </div>
        <PracticeWriter
          key={`${plan.id}:${day.number}`}
          plan={plan}
          day={day}
          onComplete={onComplete}
        />
        <Button
          className="flow-complete"
          type="submit"
          form="practice-response-form"
          disabled={busy || !!day.completedAt}
        >
          {day.completedAt ? (
            <>
              <Check size={16} /> Day complete
            </>
          ) : (
            "Complete today"
          )}
        </Button>
        {day.completedAt && (
          <p className="completion-note">
            <Check size={18} /> You made space today. That is enough.
          </p>
        )}
      </section>
      <div className="today-player" data-voice-ready={privateReady}>
        {autoplay &&
          needsVoiceDownload &&
          !voicePreparing &&
          !privateReady &&
          reader.status !== "idle" && (
            <p className="reading-context" role="status">
              Set up {voice.name} in Settings for private listening. Your
              reading stays on-device.
            </p>
          )}
        <TodayAudioDock
          autoplay={autoplay}
          onAutoplayChange={(enabled) => {
            autoplayTarget.current = null;
            setAutoplay(enabled);
          }}
          reader={playerReader}
          payload={payloads[active]}
          scripturePending={active === 0 && passageResolving}
          voicePreparing={voicePreparing}
          sectionTitle={
            active === 1
              ? day.title
              : active === 0
                ? passage.reference
                : undefined
          }
          contextLabel={`${String(active + 1).padStart(2, "0")} · ${sections[active]}${active === 0 ? ` · ${passage.translation}` : " · on-device"}`}
        />
      </div>
    </div>
  );
}
