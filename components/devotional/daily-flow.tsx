"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ChevronLeft,
  ArrowUpRight,
  BookOpen,
  Check,
  Share2,
  X,
  MoreHorizontal,
  Headphones,
  Leaf,
} from "lucide-react";
import Link from "@/components/smart-link";
import { usePrivacy } from "@/components/privacy";
import { useApp } from "@/components/provider";
import { Button } from "@/components/ui/button";
import { useAmbientAudio } from "./use-ambient-audio";
import { TodayAudioDock } from "./today-audio-dock";
import { useReadingAudio } from "@/components/scripture/use-reading-audio";
import { usePassage } from "@/components/scripture/use-passage";
import {
  devotionReflectionSpokenText,
  devotionReflectionText,
  type ReadingPayload,
} from "@/lib/tts/reading";
import { verseSpeech } from "@/lib/tts/shared";
import {
  privateVoice,
  clearPrivatePreviews,
  downloadPrivateVoice,
} from "@/lib/tts/private-voice";
import type { PassageType, DayType, PlanType } from "@/lib/schemas";
import { PracticeWriter } from "./practice-writer";
import { PrayerWriter } from "./prayer-writer";

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
  onOpenDay,
  immersive,
  setImmersive,
}: {
  localPassage: PassageType;
  plan: PlanType;
  day: DayType;
  busy: boolean;
  onComplete: (response: string) => Promise<void>;
  onOpenDay: (index: number) => void;
  immersive: boolean;
  setImmersive: (value: boolean) => void;
}) {
  const devotional = day.devotionalFormat === "baptist-daily";
  const sections = [
    "Scripture",
    "Reflection",
    "Prayer",
    devotional ? "Write It Down" : "Practice",
  ];
  const { state, online, update } = useApp();
  const { lock } = usePrivacy();
  const voice = privateVoice(state.speechEngine);
  const { passage, resolving: passageResolving } = usePassage(localPassage);
  const [active, setActive] = useState(0);
  const previous = plan.days
    .slice(0, day.number - 1)
    .reverse()
    .find((d) => d.completedAt);
  const nextDay = plan.days[day.number];
  const menu = useRef<HTMLDetailsElement>(null);
  const viewAnchor = useRef<{ element: HTMLElement; top: number } | null>(null);
  useEffect(() => {
    document.body.classList.add("still-listening");
    return () => document.body.classList.remove("still-listening");
  }, []);
  useLayoutEffect(() => {
    document.body.classList.toggle("still-reading", immersive);
    const anchor = viewAnchor.current;
    viewAnchor.current = null;
    if (anchor?.element.isConnected) {
      window.scrollBy({
        top: anchor.element.getBoundingClientRect().top - anchor.top,
        behavior: "instant",
      });
    }
    return () => document.body.classList.remove("still-reading");
  }, [immersive]);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (menu.current?.open && !menu.current.contains(event.target as Node))
        menu.current.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && menu.current?.open) {
        menu.current.open = false;
        menu.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  const [autoplay, setAutoplay] = useState(true);
  const autoplayRef = useRef(autoplay);
  autoplayRef.current = autoplay;
  const voiceListenRef = useRef(state.todayVoiceOn !== false);
  voiceListenRef.current = state.todayVoiceOn !== false;
  const autoplayTarget = useRef<number | null>(null);
  const latestReader = useRef<ReturnType<typeof useReadingAudio> | null>(null);
  const [privateReady, setPrivateReady] = useState(false);
  const [needsVoiceDownload, setNeedsVoiceDownload] = useState(false);
  const [voicePreparing, setVoicePreparing] = useState(false);
  const voicePrepare = useRef<AbortController | null>(null);
  const refs = useRef<(HTMLElement | null)[]>([]),
    lockScroll = useRef(0),
    sectionNavUntil = useRef(0),
    consumed = useRef(0);
  const payloads: ReadingPayload[] = [
    { kind: "scripture", ...verseSpeech(passage) },
    {
      kind: "devotional",
      text: devotional ? day.reflection : devotionReflectionSpokenText(day),
      title: day.title,
    },
    { kind: "prayer", text: day.prayer, title: day.title },
    { kind: "action", text: day.action, title: day.title },
  ];
  const reader = useReadingAudio(payloads[active], {
    licensedTextPending: active === 0 && passageResolving,
    matchReflectionVoice: true,
  });
  latestReader.current = reader;
  const ambient = useAmbientAudio(
    state.todayAmbientOn === true,
    state.todayVoiceOn === false ? "idle" : reader.status,
    state.todayMusicLevel,
  );
  function changeView(focused: boolean) {
    const element = refs.current[active];
    if (element && window.scrollY > 0) {
      viewAnchor.current = {
        element,
        top: element.getBoundingClientRect().top,
      };
      lockScroll.current = performance.now() + 1200;
    }
    if (menu.current) menu.current.open = false;
    setImmersive(focused);
  }
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
    if (
      autoplay &&
      state.todayVoiceOn !== false &&
      (reader.status === "playing" || autoplayTarget.current !== null)
    ) {
      autoplayTarget.current = index;
      sectionNavUntil.current = performance.now() + 2500;
    } else if (!automatic) {
      autoplayTarget.current = null;
    }
    lockScroll.current = performance.now() + 1200;
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
      if (
        performance.now() < lockScroll.current ||
        performance.now() < sectionNavUntil.current
      ) {
        frame = requestAnimationFrame(measure);
        return;
      }
      const line = Math.min(window.innerHeight * 0.38, 320);
      let next = 0;
      refs.current.forEach((section, i) => {
        if (section && section.getBoundingClientRect().top <= line) next = i;
      });
      setActive((current) => {
        if (current === next) return current;
        if (
          autoplayRef.current &&
          voiceListenRef.current &&
          (latestReader.current?.status === "playing" ||
            autoplayTarget.current !== null)
        ) {
          autoplayTarget.current = next;
        }
        return next;
      });
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
    if (!autoplay || state.todayVoiceOn === false) return;
    if (autoplayTarget.current !== active) return;
    const section = active;
    let alive = true;
    const attempt = (tries = 0) => {
      if (!alive || autoplayTarget.current !== section) return;
      const current = latestReader.current;
      if (section === 0 && passageResolving) {
        if (tries < 50) window.setTimeout(() => attempt(tries + 1), 80);
        return;
      }
      if (!current || current.empty || current.status === "loading") {
        if (tries < 50) window.setTimeout(() => attempt(tries + 1), 80);
        return;
      }
      autoplayTarget.current = null;
      sectionNavUntil.current = performance.now() + 800;
      void current.play();
    };
    const timer = window.setTimeout(() => attempt(), 48);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    active,
    autoplay,
    state.todayVoiceOn,
    passageResolving,
    payloads[active].text,
    payloads[active].kind,
  ]);
  const playerReader = {
    ...reader,
    stop() {
      autoplayTarget.current = null;
      sectionNavUntil.current = 0;
      reader.stop();
    },
    play() {
      autoplayTarget.current = null;
      sectionNavUntil.current = 0;
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
      className="daily-flow is-immersive"
      data-view={immersive ? "reading" : "overview"}
      data-section={active}
    >
      <>
        <div className="still-scene" aria-hidden="true">
          <div className="still-scene-landscape" />
          <div className="still-scene-glow" />
          <div className="still-scene-dust" />
        </div>
        <header className="listening-header">
          {immersive ? (
            <button
              type="button"
              aria-label="Leave immersive view"
              onClick={() => {
                changeView(false);
              }}
            >
              <X size={22} />
            </button>
          ) : (
            <Link
              className="today-home-link"
              href="/journey"
              aria-label="My journey"
            >
              <Leaf size={22} />
            </Link>
          )}
          <div className="reader-day-position">
            {previous && (
              <button
                type="button"
                disabled={busy}
                aria-label={`Revisit completed day ${previous.number}`}
                onClick={() => onOpenDay(previous.number - 1)}
              >
                <ChevronLeft size={17} />
              </button>
            )}
            <span>
              Day {day.number} of {plan.days.length}
            </span>
          </div>
          <details className="listening-menu" ref={menu}>
            <summary aria-label="Listening options">
              <MoreHorizontal size={22} />
            </summary>
            <div>
              <Link href="/journey">My journey</Link>
              <Link href="/journal">Journal</Link>
              <Link href="/settings#reading-voice">Voice settings</Link>
              <button type="button" onClick={() => reader.restartSection?.()}>
                Restart this section
              </button>
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
              <label className="music-level-control">
                Reading speed
                <select
                  aria-label="Reading speed"
                  value={reader.speed}
                  onChange={(event) =>
                    reader.changeSpeed(Number(event.target.value))
                  }
                >
                  {[0.8, 0.9, 1, 1.1, 1.2].map((rate) => (
                    <option value={rate} key={rate}>
                      {rate.toFixed(1)}×
                    </option>
                  ))}
                </select>
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
      {!immersive && (
        <div className="today-welcome">
          <p>
            {new Intl.DateTimeFormat("en", {
              weekday: "long",
              month: "long",
              day: "numeric",
            }).format(new Date())}
          </p>
          <h1>
            {devotional
              ? `Day ${day.number}: ${day.title}`
              : "Make room for today."}
          </h1>
        </div>
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
        <div className="flow-verse-copy">
          <p className="eyebrow">
            {passage.reference} · {passage.translation}
          </p>
          <h2 id="verse-heading" tabIndex={-1}>
            {devotional ? "Today’s Scripture" : "Scripture for today"}
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
        {!immersive && (
          <div className="overview-actions">
            <button
              type="button"
              onClick={() => {
                if (state.todayAmbientOn) ambient.start(true);
                void update((s) => ({ ...s, todayVoiceOn: true }));
                if (reader.status === "idle" || reader.status === "paused")
                  void reader.play();
                changeView(true);
              }}
            >
              <Headphones size={20} /> Listen
            </button>
            <button type="button" onClick={() => changeView(true)}>
              <BookOpen size={20} /> Read
            </button>
          </div>
        )}
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
            {devotional ? "Reflection" : day.title}
          </h2>
          {day.reflection.split(/\n\s*\n/u).map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
          {!devotional && (
            <>
              <div className="question-box">
                {day.questions.map((q) => (
                  <p key={q}>{q}</p>
                ))}
              </div>
              <p className="fine-print flow-interpretation-note">
                {day.interpretation}
              </p>
            </>
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
          <span>03</span> PRAYER / CONTEMPLATION
        </div>
        <div className="devotional-prose">
          <h2 id="prayer-heading" tabIndex={-1}>
            {devotional ? "Prayer" : "Come as you are."}
          </h2>
          <p className="fine-print">
            A personal prayer or contemplation inspired by today’s reading. This
            is not Scripture.
          </p>
          <p className="prayer-text">{day.prayer}</p>
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
            {devotional ? "Write It Down" : "Carry it into your day."}
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
          <div className="reader-continuation">
            <p role="status">
              {plan.days.every((d) => d.completedAt)
                ? "You’ve completed this journey."
                : "You made space today."}
            </p>
            {nextDay ? (
              <button
                type="button"
                onClick={() => onOpenDay(nextDay.number - 1)}
              >
                Continue to Day {nextDay.number} <ArrowRight size={16} />
              </button>
            ) : (
              <Link href="/journey">
                View my journeys <ArrowRight size={16} />
              </Link>
            )}
          </div>
        )}
      </section>
      <div className="today-player" data-voice-ready={privateReady}>
        <TodayAudioDock
          autoplay={autoplay}
          onAutoplayChange={(enabled) => {
            autoplayTarget.current = null;
            setAutoplay(enabled);
          }}
          reader={playerReader}
          ambient={ambient}
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
