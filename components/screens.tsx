"use client";
import { AudioSettings } from "./scripture/audio-settings";
import { CloudFallbackNotice } from "./cloud-status";
import { DeviceWelcome, StartFreshSettings } from "./first-run";
import { needsJourneyWelcome } from "@/lib/client/onboarding";
import { ReadingAudio, ScriptureAudio } from "./scripture/audio-player";
import { PinSettings } from "./privacy";
import { PrayerWriter } from "./devotional/prayer-writer";
import { Participation } from "./devotional/participation";
import { usePassage } from "./scripture/use-passage";
import { selectedProvider } from "@/lib/client/modes";
import { buildGuidedPlan } from "@/lib/ai/guided";
import { ModeSettings } from "./mode-settings";
import { useEffect, useRef, useState } from "react";
import { readChatStream } from "@/lib/client/chat-stream";
import {
  readCloudVendor,
  recordCloudVendor,
  recordCloudStatus,
} from "@/lib/client/cloud-status";
import { groqGuidedPlan } from "@/lib/ai/groq-guided";
import Link from "@/components/smart-link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Leaf,
  MessageCircle,
  Plus,
  Search,
  Send,
  Sparkles,
  Sun,
  WifiOff,
} from "lucide-react";
import { useApp } from "./provider";
import { Button } from "./ui/button";
import { PassageCard } from "./scripture/passage";
import { Today } from "./devotional/today";
import { api, recoverable } from "@/lib/client/store";
import { buildPlan } from "@/lib/ai/orchestrator";
import { answerQuestion } from "@/lib/ai/chat";
import { themes } from "@/lib/ai/themes";
import { translationNames } from "@/lib/bible";
import { defaultTranslationFromAvailable } from "@/lib/bible/default-translation";
import type { TranslationsStatus } from "@/lib/client/hosted-translation";
import type {
  PlanType,
  PassageType,
  ChatType,
  TranslationId,
  JournalType,
} from "@/lib/schemas";
function Heading({
  label,
  title,
  description,
}: {
  label: string;
  title: string;
  description: string;
}) {
  return (
    <div className="simple-heading">
      <p className="eyebrow">{label}</p>
      <h1>{title}</h1>
      <p className="page-intro">{description}</p>
    </div>
  );
}
function Create() {
  const { state, bible, getBible, savePlan, online, setError } = useApp();
  const router = useRouter();
  const [prompt, setPrompt] = useState(""),
    [days, setDays] = useState(7),
    [busy, setBusy] = useState(false),
    [available, setAvailable] = useState<TranslationId[]>(["WEB"]),
    [journeyTranslation, setJourneyTranslation] =
      useState<TranslationId>(state.translation);
  const journeyTranslationTouched = useRef(false);
  useEffect(() => {
    api<TranslationsStatus>("translations")
      .then((r) => {
        const ids = r.translations
          .filter((t) => t.available)
          .map((t) => t.id);
        setAvailable(ids);
        if (journeyTranslationTouched.current) return;
        const preferred = ids.includes(r.default)
          ? r.default
          : defaultTranslationFromAvailable(ids, r.default);
        setJourneyTranslation(
          ids.includes(state.translation) ? state.translation : preferred,
        );
      })
      .catch(() => {});
  }, [state.translation]);
  async function generate(e: React.FormEvent) {
    e.preventDefault();
    if (!bible) return;
    setBusy(true);
    try {
      const input = {
        prompt,
        days,
        translation: journeyTranslation,
        provider: selectedProvider(state),
      };
      if (online || input.provider === "ollama") {
        try {
          const { plan } = await api<{ plan: PlanType }>(
            "plans/generate",
            input,
            { cloudConsent: state.cloudConsent },
          );
          if (plan.provider === "groq") recordCloudStatus("connected", false);
          await savePlan(plan, true);
        } catch (error) {
          if (
            input.provider === "cloud" &&
            readCloudVendor() === "groq" &&
            recoverable(error)
          ) {
            recordCloudStatus("unavailable", true);
            await savePlan(groqGuidedPlan(input, await getBible("WEB")));
          } else {
            if (state.provider !== "curated" || !recoverable(error))
              throw error;
            await savePlan(buildGuidedPlan(input, bible));
          }
        }
      } else {
        if (input.provider === "cloud" && readCloudVendor() === "groq") {
          recordCloudStatus("unavailable", true);
          await savePlan(groqGuidedPlan(input, await getBible("WEB")));
        } else {
          if (state.provider !== "curated")
            throw new Error(
              "Models need a connection. Select the local curated guide in Settings.",
            );
          await savePlan(buildGuidedPlan(input, bible));
        }
      }
      router.push("/today");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="narrow-page">
      <Heading
        label="A JOURNEY THAT MEETS YOU HERE"
        title="What’s on your heart?"
        description="Start with a real question, a season of life, or a small hope. We’ll make room for it in Scripture."
      />
      <form className="form-card" onSubmit={generate}>
        <label htmlFor="goal">I’d like to explore…</label>
        <textarea
          id="goal"
          required
          minLength={3}
          maxLength={1200}
          rows={5}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="I feel anxious about a decision at work. Help me find peace and wisdom, one small step at a time."
        />
        <p className="field-hint">
          Share only what you’re comfortable saving on this device.
        </p>
        <p className="field-hint">
          {state.provider === "cloud"
            ? "Describe your season in your own words. Still retrieves exact WEB verses; Groq shapes the journey around your prompt."
            : "Guided mode accepts a theme such as anxiety or a reference such as John 3:16. Nothing is sent to a cloud model."}
        </p>
        <button
          type="button"
          className="text-link"
          onClick={() => setPrompt("Study John 3:16")}
        >
          Study a specific passage · John 3:16
        </button>
        <div className="topic-chips">
          {Object.keys(themes).map((topic) => (
            <button
              type="button"
              key={topic}
              onClick={() =>
                setPrompt(
                  `I want to grow through ${topic.replace("-", " ")} with a gentle daily practice`,
                )
              }
            >
              {topic.replace("-", " ")}
            </button>
          ))}
        </div>
        <div className="form-row">
          <div>
            <label htmlFor="duration">Make a little space for</label>
            <select
              id="duration"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            >
              {[3, 5, 7, 10, 14].map((d) => (
                <option value={d} key={d}>
                  {d} days
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="journey-translation">Scripture edition</label>
            <select
              id="journey-translation"
              value={journeyTranslation}
              onChange={(e) => {
                journeyTranslationTouched.current = true;
                setJourneyTranslation(e.target.value as TranslationId);
              }}
            >
              {Object.entries(translationNames)
                .filter(([id]) => available.includes(id as TranslationId))
                .sort(([a], [b]) =>
                  a === "WEB" ? -1 : b === "WEB" ? 1 : 0,
                )
                .map(([id, name]) => (
                  <option value={id} key={id}>
                    {id} — {name}
                    {id === "WEB"
                      ? " (offline)"
                      : ["CSB", "NLT", "MSG"].includes(id)
                        ? " (online)"
                        : ""}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label>Your guide</label>
            <p className="provider-label">
              {state.provider === "curated"
                ? "Guided study"
                : state.provider === "ollama"
                  ? "Your Mac · Ollama"
                  : "Custom journey · Groq"}
            </p>
            <Link className="text-link" href="/settings">
              {state.provider === "cloud"
                ? "Switch to guided only"
                : "Change guide"}{" "}
              <ArrowUpRight size={12} />
            </Link>
          </div>
        </div>
        {journeyTranslation !== "WEB" && (
          <p className="field-hint">
            Journeys are stored with exact WEB verses for offline use. With
            online Scripture enabled in Settings, Today and reading can show{" "}
            {journeyTranslation} from API.Bible.
          </p>
        )}
        {state.provider === "cloud" && (
          <p className="notice">
            Your goal is sent to Groq to draft this {days}-day journey. Verse
            references are validated against Still’s local WEB Bible; wording
            online follows your edition when API.Bible access is enabled.
          </p>
        )}
        <Button type="submit" disabled={busy || !bible}>
          {busy ? "Preparing your journey…" : "Begin my journey"}
          <ArrowRight size={17} />
        </Button>
        <p className="fine-print">
          Your journey opens directly on Day 1. No schedule to catch up with.
        </p>
      </form>
      <div className="quiet-process">
        <span>01 · Your intention</span>
        <span>02 · Exact Scripture</span>
        <span>03 · One faithful step</span>
      </div>
    </div>
  );
}
function Journey() {
  const { state, update } = useApp();
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <>
      <div className="heading-with-action">
        <Heading
          label="GROW AT YOUR OWN PACE"
          title="Your journeys."
          description="Small beginnings. Meaningful steps. A place to return."
        />
        <Button asChild>
          <Link href="/create">
            <Plus size={16} />
            New journey
          </Link>
        </Button>
      </div>
      <div className="journey-grid">
        {state.plans.map((plan, index) => {
          const done = plan.days.filter((d) => d.completedAt).length;
          return (
            <article className="library-card" key={plan.id}>
              <div className={`library-art art-${index % 3}`}>
                <Leaf size={48} strokeWidth={0.8} />
                <span>
                  {plan.days.length} DAYS ·{" "}
                  {plan.profile.themes[0].toUpperCase()}
                </span>
              </div>
              <div className="library-body">
                <p className="eyebrow">
                  {done === plan.days.length
                    ? "COMPLETED WITH CARE"
                    : done
                      ? "KEEP GROWING"
                      : "A NEW BEGINNING"}
                </p>
                <h2>{plan.title}</h2>
                <p>{plan.profile.prompt}</p>
                <div className="progress-track">
                  <span
                    style={{ width: `${(done / plan.days.length) * 100}%` }}
                  />
                </div>
                <div className="library-actions">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      update((s) => ({ ...s, activeId: plan.id }));
                      router.push("/today");
                    }}
                  >
                    {done ? "Return to journey" : "Start Day 1"}
                    <ArrowRight size={16} />
                  </Button>
                  <button
                    className="text-link"
                    onClick={() =>
                      setExpanded(expanded === plan.id ? null : plan.id)
                    }
                  >
                    {expanded === plan.id ? "Hide days" : "See days"}
                  </button>
                </div>
                {expanded === plan.id && (
                  <ol className="outline-list">
                    {plan.days.map((d) => (
                      <li key={d.number}>
                        <span>
                          {d.completedAt ? <Check size={14} /> : d.number}
                        </span>
                        <div>
                          <strong>{d.title}</strong>
                          <small>{d.passage.reference}</small>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {!state.plans.length && (
        <div className="empty-state">
          <Leaf />
          <h2>Your next chapter starts here.</h2>
          <Link href="/create">Create your first journey</Link>
        </div>
      )}
    </>
  );
}
function Scripture() {
  const { state, update, bible, setError } = useApp();
  const [query, setQuery] = useState("John 1"),
    [reference, setReference] = useState("John 1"),
    [results, setResults] = useState<PassageType[] | null>(null),
    [verseView, setVerseView] = useState(true),
    [total, setTotal] = useState(0),
    [offset, setOffset] = useState(0),
    [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref) {
      setQuery(ref);
      setReference(ref);
    }
  }, []);
  let preview: PassageType;
  try {
    preview = bible?.lookup(reference, state.translation) ?? {
      reference: "John 1",
      requestedTranslation: state.translation,
      translation: "WEB" as const,
      fallback: false,
      notice: "",
      verses: [],
      text: "",
    };
  } catch {
    preview = bible!.lookup("John 1", state.translation);
  }
  const { passage: displayedPassage } = usePassage(preview);
  if (!bible) return <p className="loading">Preparing the Bible…</p>;
  let passage: PassageType;
  try {
    passage = displayedPassage;
  } catch {
    passage = bible.lookup("John 1", state.translation);
  }
  const books = bible.books();
  const chapter = passage.verses[0].chapter,
    book = passage.verses[0].book;
  const bookInfo = books.find((b) => b.book === book)!;
  function search(e?: React.FormEvent, newOffset = 0) {
    e?.preventDefault();
    try {
      if (/\d/.test(query)) {
        const p = bible!.lookup(query, state.translation);
        setReference(p.reference);
        setResults(null);
      } else {
        const theme = themes[query.toLowerCase()];
        const r = theme
          ? {
              results: theme.lessons
                .slice(newOffset, newOffset + 20)
                .map((l) => bible!.lookup(l.reference, state.translation)),
              total: theme.lessons.length,
            }
          : bible!.search(query, state.translation, newOffset, 20);
        setResults(r.results);
        setTotal(r.total);
        setOffset(newOffset);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function navigate(ref: string) {
    try {
      bible!.lookup(ref, state.translation);
      setReference(ref);
      setQuery(ref);
      setResults(null);
      setSelected(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <Heading
        label="ROOTED IN THE WORD"
        title="Room to read."
        description="An open Bible. An unhurried heart."
      />
      <form className="search-bar" onSubmit={search}>
        <Search size={19} />
        <label htmlFor="scripture-search" className="sr-only">
          Search Scripture
        </label>
        <input
          id="scripture-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Reference, topic, or keyword"
        />
        <Button type="submit" size="sm">
          Search
        </Button>
      </form>
      {results ? (
        <div className="search-results">
          <p>{total} passages found</p>
          {results.map((p) => (
            <article className="search-result" key={p.reference}>
              <PassageCard compact passage={p} />
              <Button variant="ghost" onClick={() => navigate(p.reference)}>
                Open passage <ArrowRight size={15} />
              </Button>
            </article>
          ))}
          <div className="toolbar">
            <Button
              variant="outline"
              disabled={!offset}
              onClick={() => search(undefined, Math.max(0, offset - 20))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              disabled={offset + 20 >= total}
              onClick={() => search(undefined, offset + 20)}
            >
              Next results
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="reader-toolbar">
            <div className="toolbar">
              <select
                aria-label="Book"
                value={book}
                onChange={(e) => navigate(`${e.target.value} 1`)}
              >
                {books.map((b) => (
                  <option key={b.book}>{b.book}</option>
                ))}
              </select>
              <select
                aria-label="Chapter"
                value={chapter}
                onChange={(e) => navigate(`${book} ${e.target.value}`)}
              >
                {Array.from({ length: bookInfo.chapters }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    Chapter {i + 1}
                  </option>
                ))}
              </select>
              <span className="translation-badge">{passage.translation}</span>
            </div>
            <Button variant="ghost" onClick={() => setVerseView(!verseView)}>
              {verseView ? "Chapter view" : "Verse view"}
            </Button>
          </div>
          <article className="reader-paper">
            <p className="eyebrow">
              {passage.translation} · {translationNames[passage.translation]}
            </p>
            <h2>
              {book} <em>{chapter}</em>
            </h2>
            {passage.attribution && (
              <p className="translation-notice">{passage.attribution}</p>
            )}
            {passage.fallback && (
              <p className="translation-notice">{passage.notice}</p>
            )}
            {verseView ? (
              <div className="verses">
                {passage.verses.map((v) => {
                  const ref = `${book} ${chapter}:${v.verse}`;
                  const key = `${passage.translation}:${ref}`;
                  return (
                    <div
                      key={v.verse}
                      className={`verse-row ${state.highlights[key] ? "highlighted" : ""}`}
                    >
                      <button
                        aria-label={`Select verse ${v.verse}`}
                        className="verse-number"
                        onClick={() =>
                          setSelected(selected === key ? null : key)
                        }
                      >
                        {v.verse}
                      </button>
                      <div>
                        <p>{v.text}</p>
                        {selected === key && (
                          <div className="verse-tools">
                            <ScriptureAudio
                              passage={{
                                ...passage,
                                reference: ref,
                                verses: [v],
                                text: v.text,
                              }}
                            />
                            <Button variant="outline" size="sm" asChild>
                              <Link
                                href={`/create-image?${new URLSearchParams({ ref, translation: state.translation })}`}
                              >
                                Create Image
                              </Link>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                update((s) => ({
                                  ...s,
                                  highlights: {
                                    ...s.highlights,
                                    [key]: s.highlights[key] ? "" : "sage",
                                  },
                                }))
                              }
                            >
                              {state.highlights[key]
                                ? "Remove highlight"
                                : "Highlight"}
                            </Button>
                            <label htmlFor={`note-${v.verse}`}>Your note</label>
                            <textarea
                              id={`note-${v.verse}`}
                              maxLength={3000}
                              value={state.notes[key] ?? ""}
                              onChange={(e) =>
                                update((s) => ({
                                  ...s,
                                  notes: { ...s.notes, [key]: e.target.value },
                                }))
                              }
                              placeholder="A thought to keep…"
                            />
                          </div>
                        )}
                        {state.notes[key] && selected !== key && (
                          <small className="note-preview">
                            {state.notes[key]}
                          </small>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <PassageCard passage={passage} />
            )}
            <div className="reader-pagination">
              <Button
                variant="ghost"
                disabled={chapter === 1}
                onClick={() => navigate(`${book} ${chapter - 1}`)}
              >
                <ChevronLeft size={17} />
                Previous
              </Button>
              <Button
                variant="ghost"
                disabled={chapter === bookInfo.chapters}
                onClick={() => navigate(`${book} ${chapter + 1}`)}
              >
                Next chapter
                <ChevronRight size={17} />
              </Button>
            </div>
          </article>
        </>
      )}
    </>
  );
}
function Chat() {
  const { state, update, bible, online, setError } = useApp();
  const [question, setQuestion] = useState(""),
    [messages, setMessages] = useState<
      { question: string; response: ChatType }[]
    >([]),
    [busy, setBusy] = useState(false);
  const [groq, setGroq] = useState<boolean | null>(null);
  const [draft, setDraft] = useState<{
    text: string;
    citations: PassageType[];
  } | null>(null);
  const streamAbort = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      streamAbort.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (state.provider !== "cloud" || !online) return;
    let alive = true;
    fetch("/api/modes")
      .then((r) => r.json())
      .then((status) => {
        if (!alive) return;
        recordCloudVendor(status.modes.cloud.vendor);
        setGroq(status.modes.cloud.vendor === "groq");
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [state.provider, online]);
  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (!bible) return;
    setBusy(true);
    try {
      const input = {
        question,
        translation: state.onlineScripture ? state.translation : "WEB",
        provider: selectedProvider(state),
        history: messages
          .slice(-8)
          .map((m) => ({ question: m.question, answer: m.response.answer })),
      };
      if (!online && state.provider === "cloud" && readCloudVendor() !== "groq")
        throw new Error(
          "This model requires a connection. Choose the local guide for offline use.",
        );
      let response: ChatType;
      try {
        let useGroq = groq;
        if (online && input.provider === "cloud" && useGroq === null) {
          const status = await fetch("/api/modes").then((r) => r.json());
          recordCloudVendor(status.modes.cloud.vendor);
          useGroq = status.modes.cloud.vendor === "groq";
          setGroq(useGroq);
        }
        if (online && input.provider === "cloud" && useGroq) {
          const controller = new AbortController();
          streamAbort.current = controller;
          setDraft({ text: "", citations: [] });
          response = await readChatStream(
            input,
            state.cloudConsent,
            controller.signal,
            (event) => {
              if (controller.signal.aborted) return;
              if (event.type === "citations")
                setDraft((d) => ({
                  text: d?.text ?? "",
                  citations: event.passages,
                }));
              if (event.type === "text")
                setDraft((d) => ({
                  text: (d?.text ?? "") + event.text,
                  citations: d?.citations ?? [],
                }));
            },
          );
        } else {
          response =
            online || input.provider === "ollama"
              ? await api<ChatType>("chat", input, {
                  cloudConsent: state.cloudConsent,
                })
              : answerQuestion(input, bible);
          if (!online && input.provider === "cloud")
            recordCloudStatus("unavailable", true);
        }
      } catch (error) {
        if (streamAbort.current?.signal.aborted) return;
        if (
          input.provider === "cloud" &&
          readCloudVendor() === "groq" &&
          recoverable(error)
        ) {
          recordCloudStatus("unavailable", true);
          response = answerQuestion({ ...input, provider: "curated" }, bible);
        } else {
          if (state.provider !== "curated" || !recoverable(error)) throw error;
          response = answerQuestion(input, bible);
        }
      }
      setMessages((m) => [...m, { question, response }]);
      setQuestion("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDraft(null);
      streamAbort.current = null;
      setBusy(false);
    }
  }
  return (
    <div className="chat-page">
      <CloudFallbackNotice />
      <Heading
        label="YOUR QUESTIONS ARE WELCOME"
        title="Let’s open the Word."
        description="Thoughtful questions. Scripture at the center."
      />
      <section className="notice" aria-label="Active chat mode">
        <strong>
          {state.provider === "curated"
            ? "Guided study · reference and topic answers"
            : state.provider === "ollama"
              ? "Local Mac · Ollama · open-ended Bible Q&A"
              : "Cloud model · open-ended Bible Q&A"}
        </strong>
        <p className="field-hint">
          {state.provider === "curated"
            ? "Checking a model connection does not select it. Choose Local Mac · Ollama in Settings to use your installed model for open-ended questions."
            : state.provider === "ollama"
              ? "Your selected local model answers using separately retrieved and validated Scripture. No cloud fallback."
              : state.cloudConsent
                ? "Cloud sharing is enabled for your next question."
                : "Cloud sharing is not enabled. Enable it explicitly in Settings before sending."}
        </p>
        <Link className="text-link" href="/settings">
          Change answer mode
        </Link>
        {state.provider === "curated" && (
          <Button
            variant="outline"
            onClick={async () => {
              await update((s) => ({
                ...s,
                provider: "ollama",
                cloudConsent: false,
              }));
            }}
          >
            Use Local Mac · Ollama
          </Button>
        )}
      </section>
      {!messages.length && (
        <div className="chat-welcome">
          <span className="large-leaf">
            <MessageCircle size={30} />
          </span>
          <h2>Come with curiosity.</h2>
          <p>
            Bring the question you’ve been carrying.
            <br />
            We’ll start with Scripture, and make space to reflect.
          </p>
          <div className="chat-suggestions">
            {[
              "What does Scripture say about anxiety?",
              "How can I begin to forgive?",
              "Help me understand Psalms 23:1-6",
              "prayer",
              "forgiveness",
            ].map((q) => (
              <button key={q} onClick={() => setQuestion(q)}>
                {q}
                <ArrowUpRight size={16} />
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="chat-messages" aria-live="polite">
        {messages.map((m, i) => (
          <div className="exchange" key={i}>
            <div className="user-message">{m.question}</div>
            <article className="answer">
              <div className="eyebrow">
                <Leaf size={15} /> SCRIPTURE GUIDE ·{" "}
                {m.response.provider === "curated"
                  ? "GUIDED STUDY"
                  : m.response.provider.toUpperCase()}
              </div>
              <p className="chat-answer">{m.response.answer}</p>
              <p className="fine-print">{m.response.interpretation}</p>
              {m.response.citations.length > 0 &&
                m.response.interpretation.trim() && (
                  <ReadingAudio
                    compact
                    payload={{
                      kind: "interpretation",
                      text: m.response.interpretation,
                    }}
                  />
                )}
              {m.response.citations.map((p) => (
                <details key={p.reference}>
                  <summary>
                    <BookOpen size={15} />
                    {p.reference} · {p.translation}
                    <span>Read exact passage</span>
                  </summary>
                  <PassageCard compact passage={p} />
                  <Link
                    className="text-link"
                    href={`/scripture?ref=${encodeURIComponent(p.reference)}`}
                  >
                    Read the chapter <ArrowUpRight size={13} />
                  </Link>
                </details>
              ))}
              {m.response.limited && (
                <p className="guide-limit">
                  Guided study: reviewed thematic passages, with a deliberately
                  limited answer.
                </p>
              )}
            </article>
          </div>
        ))}
        {draft && (
          <article
            className="answer chat-stream-preview"
            aria-label="Interpretation in progress"
          >
            <p className="eyebrow">GROQ · INTERPRETATION IN PROGRESS</p>
            <p>
              {draft.text ||
                "Retrieving Scripture and preparing a grounded answer…"}
            </p>
            {draft.citations.map((p) => (
              <div key={p.reference} className="passage">
                <p className="eyebrow">
                  {p.reference} · {p.translation}
                </p>
                <blockquote>
                  {p.verses.map((v) => (
                    <span key={v.verse}>
                      <sup>{v.verse}</sup>
                      {v.text}{" "}
                    </span>
                  ))}
                </blockquote>
              </div>
            ))}
          </article>
        )}
      </div>
      <form className="chat-compose" onSubmit={ask}>
        <label className="sr-only" htmlFor="chat-question">
          Your Bible question
        </label>
        <textarea
          id="chat-question"
          required
          minLength={3}
          maxLength={1200}
          rows={2}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="What’s on your heart?"
        />
        <Button
          type="submit"
          disabled={busy || !bible || question.trim().length < 3}
          aria-label="Send question"
        >
          {busy ? <span className="spinner" /> : <Send size={18} />}
        </Button>
      </form>
      <p className="fine-print centered">
        {state.provider === "cloud"
          ? "Your question and recent conversation are sent to your configured cloud model."
          : "No cloud model is used unless you choose one in Settings."}{" "}
        Commentary is interpretation, not Scripture.
      </p>
    </div>
  );
}
function Journal() {
  const { state, update, online, setError } = useApp();
  const [text, setText] = useState(""),
    [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const body = { id: crypto.randomUUID(), text };
    try {
      let entry: JournalType = { ...body, createdAt: new Date().toISOString() };
      if (online) {
        try {
          ({ entry } = await api<{ entry: JournalType }>("journal", body));
        } catch (error) {
          if (!recoverable(error)) throw error;
        }
      }
      await update((s) => ({
        ...s,
        journals: [entry, ...s.journals],
        outbox: online ? s.outbox : [...s.outbox, { path: "journal", body }],
      }));
      setText("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="narrow-page">
      <Heading
        label="A PLACE TO REMEMBER"
        title="The things you’re noticing."
        description="Prayers, questions, ordinary mercies. Your words belong here."
      />
      <form className="form-card" onSubmit={save}>
        <label htmlFor="journal-text">Today, I’m noticing…</label>
        <textarea
          id="journal-text"
          required
          maxLength={10000}
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Begin anywhere."
        />
        <Button disabled={busy || !text.trim()} type="submit">
          Save this moment <Plus size={16} />
        </Button>
      </form>
      <Participation />
      <PrayerWriter />
      <div className="journal-entries">
        {state.journals.map((entry) => (
          <article key={entry.id}>
            <p className="eyebrow">
              {new Date(entry.createdAt).toLocaleDateString(undefined, {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </p>
            <p>{entry.text}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
function Settings() {
  const { state, update, online, setError } = useApp();
  const [available, setAvailable] = useState<string[]>(["WEB"]),
    [offline, setOffline] = useState(""),
    [install, setInstall] = useState<InstallEvent | null>(null);
  useEffect(() => {
    api<{ translations: { id: string; available: boolean }[] }>("translations")
      .then((r) =>
        setAvailable(
          r.translations.filter((t) => t.available).map((t) => t.id),
        ),
      )
      .catch(() => {});
    const listener = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", listener);
    return () => window.removeEventListener("beforeinstallprompt", listener);
  }, []);
  async function download() {
    setOffline("Saving Scripture and app screens…");
    try {
      const registration = await navigator.serviceWorker.ready;
      const channel = new MessageChannel();
      const result = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () =>
            reject(new Error("Download timed out; try again while connected.")),
          60000,
        );
        channel.port1.onmessage = (e) => {
          clearTimeout(timer);
          e.data.ok ? resolve() : reject(new Error(e.data.error));
        };
      });
      registration.active?.postMessage({ type: "CACHE_OFFLINE" }, [
        channel.port2,
      ]);
      await result;
      await navigator.storage?.persist?.();
      setOffline("Ready offline: all 66 WEB books and your saved journeys.");
    } catch (e) {
      setError((e as Error).message);
      setOffline("Download incomplete. Reconnect and try again.");
    }
  }
  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "still-private-backup.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="narrow-page">
      <Heading
        label="MAKE YOURSELF AT HOME"
        title="A space that feels like you."
        description="Simple preferences. Your reading, your rhythm."
      />
      <nav className="settings-anchors" aria-label="Settings sections">
        <a href="#answer-modes">Answer mode</a>
        <a href="#translation">Bible edition</a>
        <a href="#reading-voice">Reading voice</a>
        <a href="#privacy">PIN privacy</a>
        <a href="#device-welcome">This device</a>
      </nav>
      <section className="settings-card">
        <h2>Your Bible</h2>
        <label htmlFor="translation">Preferred translation</label>
        <select
          id="translation"
          value={state.translation}
          onChange={(e) =>
            update((s) => ({
              ...s,
              translation: e.target.value as TranslationId,
              translationPreferenceSet: true,
            }))
          }
        >
          {Object.entries(translationNames)
            .sort(([a], [b]) => (a === "WEB" ? -1 : b === "WEB" ? 1 : 0))
            .map(([id, name]) => (
              <option value={id} key={id}>
                {id} — {name}
                {id === "WEB"
                  ? " (offline default)"
                  : ["CSB", "NLT", "MSG"].includes(id)
                    ? " (optional online)"
                    : ""}
              </option>
            ))}
        </select>
        <p className="field-hint">
          {available.includes(state.translation)
            ? `${state.translation} is available. Online editions require the opt-in below.`
            : `${state.translation} online access is not configured. Exact WEB text is shown until access is available.`}{" "}
          WEB includes all 66 books. Licensed translations are never bundled
          without permission.
        </p>
      </section>
      <section className="settings-card">
        <h2>Optional online Scripture</h2>
        <label>
          <input
            type="checkbox"
            checked={state.onlineScripture}
            onChange={(e) =>
              update((s) => ({ ...s, onlineScripture: e.target.checked }))
            }
          />{" "}
          Enable API.Bible editions and required Scripture-view reporting
        </label>
        <p className="field-hint">
          CSB, NLT, and MSG require a server-configured API.Bible key and access
          to each edition. Choosing this sends Bible references and anonymous
          device/session identifiers to API.Bible for its required usage
          reporting. Personal prompts and journals are not sent. WEB stays fully
          local. Saved journeys retain WEB for offline use.
        </p>
      </section>
      <section className="settings-card">
        <h2>Your reading space</h2>
        <label htmlFor="appearance">Appearance</label>
        <select
          id="appearance"
          value={state.theme}
          onChange={(e) =>
            update((s) => ({ ...s, theme: e.target.value as typeof s.theme }))
          }
        >
          <option value="system">Follow my device</option>
          <option value="light">Warm daylight</option>
          <option value="dark">Quiet evening</option>
        </select>
      </section>
      <div id="answer-modes">
        <ModeSettings />
      </div>
      <AudioSettings />
      <PinSettings />
      <StartFreshSettings />

      <section className="settings-card">
        <h2>Take a little stillness with you.</h2>
        <p>
          Save this app and the complete WEB Bible for offline reading. Saved
          journeys, notes, and journal entries stay on this device.
        </p>
        <div className="toolbar">
          <Button variant="outline" onClick={download} disabled={!online}>
            <Download size={16} />
            Download for offline
          </Button>
          {install && (
            <Button
              onClick={async () => {
                await install.prompt();
                setInstall(null);
              }}
            >
              Install Still
            </Button>
          )}
        </div>
        <p className="field-hint">
          On iPhone or iPad, use Share → Add to Home Screen. Export verse
          artwork to set as wallpaper; PWAs cannot install native lock-screen
          widgets.
        </p>
        {offline && (
          <p role="status" className="notice">
            {offline}
          </p>
        )}
      </section>
      <section className="settings-card">
        <h2>Your words belong to you.</h2>
        <p>
          No ads. No account required. WEB stays local; optional online
          Scripture includes disclosed usage reporting. Browser storage and
          local server files are unencrypted; use a private device. Export a
          backup before clearing browser data.
        </p>
        <Button variant="outline" onClick={exportData}>
          <Download size={16} />
          Export my data
        </Button>
        <p className="field-hint">
          {state.outbox.length} changes waiting to sync. Plans created offline
          remain on this device.
        </p>
      </section>
    </div>
  );
}
interface InstallEvent extends Event {
  prompt: () => Promise<void>;
}
export function AppScreen({ screen }: { screen: string }) {
  const { ready, state } = useApp();
  if (!ready)
    return (
      <div className="loading-screen">
        <Leaf size={34} />
        <p>Make a little space.</p>
      </div>
    );
  if (["today", "journey"].includes(screen) && needsJourneyWelcome(state))
    return <DeviceWelcome />;
  return screen === "today" ? (
    <Today />
  ) : screen === "create" ? (
    <Create />
  ) : screen === "journey" ? (
    <Journey />
  ) : screen === "scripture" ? (
    <Scripture />
  ) : screen === "chat" ? (
    <Chat />
  ) : screen === "journal" ? (
    <Journal />
  ) : (
    <Settings />
  );
}
