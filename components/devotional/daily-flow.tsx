"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUpRight, BookOpen, Check, Share2 } from "lucide-react";
import Link from "@/components/smart-link";
import { useApp } from "@/components/provider";
import { Button } from "@/components/ui/button";
import { ReadingControls } from "@/components/scripture/audio-player";
import { useReadingAudio } from "@/components/scripture/use-reading-audio";
import { usePassage } from "@/components/scripture/use-passage";
import { type ReadingPayload } from "@/lib/tts/reading";
import { verseSpeech } from "@/lib/tts/shared";
import { offlineModelStored } from "@/lib/tts/model-cache";
import { clearKokoroPreviews, warmKokoro } from "@/lib/tts/kokoro-client";
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
  const { state, online } = useApp();
  const passage = usePassage(localPassage);
  const [active, setActive] = useState(0);
  const [autoplay, setAutoplay] = useState(true);
  const autoplayTarget = useRef<number | null>(null);
  const latestReader = useRef<ReturnType<typeof useReadingAudio> | null>(null);
  const [bellaReady, setBellaReady] = useState(false);
  const [needsBellaDownload, setNeedsBellaDownload] = useState(false);
  const refs = useRef<(HTMLElement | null)[]>([]),
    lockScroll = useRef(0),
    consumed = useRef(0);
  const payloads: ReadingPayload[] = [
    { kind: "scripture", ...verseSpeech(passage) },
    { kind: "devotional", text: day.reflection, title: day.title },
    { kind: "prayer", text: day.prayer, title: day.title },
    { kind: "action", text: day.action, title: day.title },
  ];
  const reader = useReadingAudio(payloads[active]);
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
      void latestReader.current?.play();
    });
    return () => cancelAnimationFrame(frame);
  }, [active, autoplay]);
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
    day.reflection,
    day.prayer,
    day.action,
    state.speechEngine,
  ]);
  useEffect(() => {
    let alive = true;
    setBellaReady(false);
    setNeedsBellaDownload(false);
    const timer = setTimeout(async () => {
      if (state.speechEngine === "device") return;
      // Warm the server runtime without sending any verse or personal text.
      if (online && ["auto", "edge"].includes(state.speechEngine))
        void fetch("/api/tts", { method: "HEAD", cache: "no-store" }).catch(
          () => {},
        );
      const stored = await offlineModelStored().catch(() => false);
      if (!alive) return;
      setNeedsBellaDownload(!stored);
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
      latestReader.current?.clearPrepared();
      clearKokoroPreviews();
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
    setBellaReady(false);
    void (async () => {
      const stored = await offlineModelStored().catch(() => false);
      if (!stored) return;
      await warmKokoro().catch(() => false);
      if (!alive) return;
      const ready =
        (await latestReader.current?.prepareNext(payloads[active + 1], false)) ??
        false;
      if (alive) setBellaReady(ready);
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
    <div className="daily-flow">
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
          {needsBellaDownload && (
            <p className="fine-print">
              <Link href="/settings#reading-voice">
                Download Bella in Settings for faster private reading.
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
      <div className="today-player" data-bella-ready={bellaReady}>
        {autoplay &&
          needsBellaDownload &&
          !bellaReady &&
          reader.status !== "idle" && (
            <p className="reading-context" role="status">
              Set up Bella in Settings for private listening. Your reading stays
              on-device.
            </p>
          )}
        <ReadingControls
          minimal
          autoplay={autoplay}
          onAutoplayChange={(enabled) => {
            autoplayTarget.current = null;
            setAutoplay(enabled);
          }}
          reader={playerReader}
          payload={payloads[active]}
          contextLabel={`${String(active + 1).padStart(2, "0")} · ${sections[active]}${active === 0 ? ` · ${passage.translation}` : " · on-device"}`}
        />
      </div>
    </div>
  );
}
