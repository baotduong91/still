"use client";
import { useEffect, useState } from "react";
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
import { api } from "@/lib/client/store";
import { buildPlan } from "@/lib/ai/orchestrator";
import { answerQuestion } from "@/lib/ai/chat";
import { themes } from "@/lib/ai/themes";
import { translationNames } from "@/lib/bible";
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
  const { state, bible, savePlan, online, setError } = useApp();
  const router = useRouter();
  const [prompt, setPrompt] = useState(""),
    [days, setDays] = useState(7),
    [busy, setBusy] = useState(false);
  async function generate(e: React.FormEvent) {
    e.preventDefault();
    if (!bible) return;
    setBusy(true);
    try {
      const input = {
        prompt,
        days,
        translation: state.translation,
        provider: state.provider,
      };
      if (online) {
        const { plan } = await api<{ plan: PlanType }>("plans/generate", input);
        await savePlan(plan, true);
      } else {
        if (state.provider !== "curated")
          throw new Error(
            "Models need a connection. Select the local curated guide in Settings.",
          );
        await savePlan(buildPlan(input, bible));
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
            <label>Your guide</label>
            <p className="provider-label">
              {state.provider === "curated"
                ? "Local curated guide"
                : state.provider === "ollama"
                  ? "Your Mac · Ollama"
                  : "Cloud model"}
            </p>
            <Link className="text-link" href="/settings">
              Change in Settings <ArrowUpRight size={12} />
            </Link>
          </div>
        </div>
        {state.provider === "cloud" && (
          <p className="notice">
            Your goal and selected passages will be sent to the configured cloud
            model.
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
  if (!bible) return <p className="loading">Preparing the Bible…</p>;
  let passage: PassageType;
  try {
    passage = bible.lookup(reference, state.translation);
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
  const { state, bible, online, setError } = useApp();
  const [question, setQuestion] = useState(""),
    [messages, setMessages] = useState<
      { question: string; response: ChatType }[]
    >([]),
    [busy, setBusy] = useState(false);
  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (!bible) return;
    setBusy(true);
    try {
      const input = {
        question,
        translation: state.translation,
        provider: state.provider,
        history: messages
          .slice(-8)
          .map((m) => ({ question: m.question, answer: m.response.answer })),
      };
      if (!online && state.provider !== "curated")
        throw new Error(
          "This model requires a connection. Choose the local guide for offline use.",
        );
      const response = online
        ? await api<ChatType>("chat", input)
        : answerQuestion(input, bible);
      setMessages((m) => [...m, { question, response }]);
      setQuestion("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="chat-page">
      <Heading
        label="YOUR QUESTIONS ARE WELCOME"
        title="Let’s open the Word."
        description="Thoughtful questions. Scripture at the center."
      />
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
                {m.response.provider.toUpperCase()}
              </div>
              <p className="chat-answer">{m.response.answer}</p>
              <p className="fine-print">{m.response.interpretation}</p>
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
                  Local guide: reviewed thematic passages, with a deliberately
                  limited answer.
                </p>
              )}
            </article>
          </div>
        ))}
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
      if (online)
        ({ entry } = await api<{ entry: JournalType }>("journal", body));
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
            }))
          }
        >
          {Object.entries(translationNames).map(([id, name]) => (
            <option value={id} key={id}>
              {id} — {name}
              {id === "CSB"
                ? " (default)"
                : id === "NLT"
                  ? " (primary alternative)"
                  : ""}
            </option>
          ))}
        </select>
        <p className="field-hint">
          {available.includes(state.translation)
            ? `${state.translation} is installed.`
            : `${state.translation} requires a licensed import. Exact WEB text is shown and labeled until then.`}{" "}
          WEB includes all 66 books. Licensed translations are never bundled
          without permission.
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
      <section className="settings-card">
        <h2>Your devotional guide</h2>
        <label htmlFor="provider">Guide</label>
        <select
          id="provider"
          value={state.provider}
          onChange={(e) =>
            update((s) => ({
              ...s,
              provider: e.target.value as typeof s.provider,
            }))
          }
        >
          <option value="curated">Local curated guide · no key needed</option>
          <option value="ollama">Local Mac · Ollama</option>
          <option value="cloud">Optional cloud model</option>
        </select>
        <p className="field-hint">
          The curated guide matches supported themes to reviewed passages.
          Ollama and cloud need to be connected by the person running this app.
          Model output remains interpretation and may need discernment.
        </p>
        {state.provider === "cloud" && (
          <p className="notice">
            Cloud selected: goals, feedback included in prompts, selected
            Scripture, and recent chat messages may be sent through AI Gateway
            to your configured provider. Keys remain on the server.
          </p>
        )}
      </section>
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
          No ads. No analytics. No account required. Browser storage and local
          server files are unencrypted; use a private device. Export a backup
          before clearing browser data.
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
  const { ready } = useApp();
  if (!ready)
    return (
      <div className="loading-screen">
        <Leaf size={34} />
        <p>Make a little space.</p>
      </div>
    );
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
