"use client";
import { ScriptureAudio } from "@/components/scripture/audio-player";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Check, Download, Share2, Leaf } from "lucide-react";
import Link from "@/components/smart-link";
import { useApp } from "@/components/provider";
import { usePassage } from "@/components/scripture/use-passage";
import { Button } from "@/components/ui/button";
import type { PassageType, TranslationId } from "@/lib/schemas";
import { isApiBibleTranslation } from "@/lib/bible/default-translation";
import {
  backgrounds,
  formats,
  styles,
  renderVerseImage,
  canvasBlob,
  saveImage,
  type Background,
  type Format,
  type Style,
} from "@/lib/verse-image/render";

export function CreateImage() {
  const params = useSearchParams();
  const { bible, state } = useApp();
  const reference = params.get("ref") || "Psalms 46:10";
  const [translation, setTranslation] = useState<TranslationId>(() => {
    const value = params.get("translation") || state.translation;
    return isApiBibleTranslation(value as TranslationId)
      ? (value as TranslationId)
      : "WEB";
  });
  let passage: PassageType | null = null,
    error = "";
  try {
    passage = bible?.lookup(reference, translation) ?? null;
  } catch {
    error =
      "That reference could not be found. Open a verse in Scripture and try again.";
  }
  if (!passage)
    return (
      <section className="image-maker">
        <Link href="/scripture">Back to Scripture</Link>
        <h1>Create Image</h1>
        <p role="status">{error || "Preparing exact WEB Scripture…"}</p>
      </section>
    );
  return (
    <ImageEditor
      key={reference}
      local={passage}
      translation={translation}
      setTranslation={setTranslation}
    />
  );
}

function ImageEditor({
  local,
  translation,
  setTranslation,
}: {
  local: PassageType;
  translation: TranslationId;
  setTranslation: (t: TranslationId) => void;
}) {
  const { bible, online, state, update } = useApp();
  const [verse, setVerse] = useState(local.verses[0].verse);
  const v = local.verses.find((v) => v.verse === verse) ?? local.verses[0];
  const reference = `${v.book} ${v.chapter}:${v.verse}`;
  const single = bible!.lookup(reference, translation);
  const { passage } = usePassage(single, translation);
  const [format, setFormat] = useState<Format>("story");
  const [style, setStyle] = useState<Style>("classic");
  const [background, setBackground] = useState<Background>("mountains");
  const canvas = useRef<HTMLCanvasElement>(null);
  const [output, setOutput] = useState<{ key: string; file: File } | null>(
    null,
  );
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [sharing, setSharing] = useState(false);
  const key = JSON.stringify([
    passage.verses,
    passage.translation,
    passage.attribution,
    format,
    style,
    background,
  ]);
  const file = output?.key === key ? output.file : null;
  useEffect(() => {
    let alive = true;
    setError("");
    setMessage("");
    const image = new Image();
    image.onload = async () => {
      if (!alive || !canvas.current) return;
      try {
        renderVerseImage(canvas.current, image, passage, format, style);
        const blob = await canvasBlob(canvas.current);
        if (alive)
          setOutput({
            key,
            file: new File(
              [blob],
              `still-${reference.replace(/[^a-z0-9]+/gi, "-")}-${passage.translation}-${format}.png`,
              { type: "image/png" },
            ),
          });
      } catch (e) {
        if (alive) {
          setOutput(null);
          setError((e as Error).message);
        }
      }
    };
    image.onerror = () => {
      if (alive) {
        setOutput(null);
        setError(
          "This background could not load. Choose another scene or reconnect to download it.",
        );
      }
    };
    image.src = backgrounds[background].url;
    return () => {
      alive = false;
    };
    // key includes all retrieved text and render choices; avoid repainting on unrelated app updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  async function share() {
    if (!file) return;
    setMessage("");
    if (!navigator.share || !navigator.canShare?.({ files: [file] })) {
      saveImage(file);
      setMessage(
        "Image downloaded. Open it in Photos or Downloads to share with your favorite app.",
      );
      return;
    }
    setSharing(true);
    try {
      // File is prepared before the tap to preserve mobile user activation.
      await navigator.share({
        files: [file],
        title: `${reference} · ${passage.translation}`,
      });
      setMessage("Your image is ready to carry with you.");
    } catch (e) {
      if ((e as Error).name !== "AbortError")
        setMessage(
          "Sharing isn’t available right now. Use Save to device, then share from Photos or Downloads.",
        );
    } finally {
      setSharing(false);
    }
  }
  return (
    <div className="image-maker">
      <Link
        className="text-link"
        href={`/scripture?ref=${encodeURIComponent(reference)}`}
      >
        <ArrowLeft size={16} /> Back to Scripture
      </Link>
      <header className="image-heading">
        <p className="eyebrow">WORDS TO CARRY WITH YOU</p>
        <h1>Create Image</h1>
        <p>A little Scripture. A little beauty. A moment to share.</p>
        <label className="image-appearance">
          Workspace appearance
          <select
            aria-label="Workspace appearance"
            value={state.theme}
            onChange={(e) =>
              void update((s) => ({
                ...s,
                theme: e.target.value as typeof s.theme,
              }))
            }
          >
            <option value="system">Follow device</option>
            <option value="light">Light</option>
            <option value="dark">Quiet evening</option>
          </select>
        </label>
      </header>
      <div className="image-workspace">
        <section
          className="image-preview-panel"
          aria-label="Verse image preview"
        >
          <div className="image-preview-meta">
            <span>
              <Leaf size={14} /> {passage.translation} · exact Scripture
            </span>
            <span>
              {formats[format].width} × {formats[format].height}
            </span>
          </div>
          <div className="image-preview-stage">
            <canvas
              ref={canvas}
              className="verse-image-canvas"
              style={{
                aspectRatio: `${formats[format].width}/${formats[format].height}`,
              }}
              role="img"
              aria-label={`${passage.verses[0].text} — ${reference} · ${passage.translation}`}
            />
          </div>
          <p className="image-preview-caption">
            {styles[style].label} · {backgrounds[background].label} ·{" "}
            {formats[format].label}
          </p>
        </section>
        <div className="image-controls">
          <ScriptureAudio passage={passage} />
          <section className="image-control-section">
            <h2>
              <span>01</span> Pick a format
            </h2>
            <div
              className="image-formats"
              role="group"
              aria-label="Image format"
            >
              {Object.entries(formats).map(([id, f]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={format === id}
                  onClick={() => setFormat(id as Format)}
                >
                  <span
                    className={`format-icon format-${id}`}
                    aria-hidden="true"
                  />
                  <strong>{f.label}</strong>
                  <small>{f.ratio}</small>
                  {format === id && (
                    <Check
                      className="image-choice-check"
                      size={14}
                      aria-hidden="true"
                    />
                  )}
                </button>
              ))}
            </div>
          </section>
          <section className="image-control-section">
            <h2>
              <span>02</span> Find your style
            </h2>
            <div className="image-styles" role="group" aria-label="Image style">
              {Object.entries(styles).map(([id, s]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={style === id}
                  onClick={() => setStyle(id as Style)}
                >
                  <span
                    className="image-style-sample"
                    data-style={id}
                    style={{
                      fontFamily: s.font,
                      fontStyle: s.italic ? "italic" : "normal",
                    }}
                  >
                    Aa
                  </span>
                  <strong>{s.label}</strong>
                  {style === id && (
                    <Check
                      className="image-choice-check"
                      size={14}
                      aria-hidden="true"
                    />
                  )}
                </button>
              ))}
            </div>
            <p className="field-hint">{styles[style].description}</p>
          </section>
          <section className="image-control-section">
            <h2>A quiet backdrop</h2>
            <div
              className="image-backgrounds"
              role="group"
              aria-label="Background scene"
            >
              {Object.entries(backgrounds).map(([id, b]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={background === id}
                  onClick={() => setBackground(id as Background)}
                >
                  <span style={{ backgroundImage: `url(${b.url})` }} />
                  <strong>{b.label}</strong>
                  {background === id && (
                    <Check
                      className="image-choice-check"
                      size={14}
                      aria-hidden="true"
                    />
                  )}
                </button>
              ))}
            </div>
          </section>
          <details className="image-scripture-options">
            <summary>
              {reference} · {translation} <span>Scripture options</span>
            </summary>
            <div>
              {local.verses.length > 1 && (
                <>
                  <label htmlFor="image-verse">Choose a verse</label>
                  <select
                    id="image-verse"
                    value={verse}
                    onChange={(e) => setVerse(Number(e.target.value))}
                  >
                    {local.verses.map((v) => (
                      <option key={v.verse} value={v.verse}>
                        {v.book} {v.chapter}:{v.verse}
                      </option>
                    ))}
                  </select>
                </>
              )}
              <label htmlFor="image-translation">Bible translation</label>
              <select
                id="image-translation"
                value={translation}
                onChange={(e) =>
                  setTranslation(e.target.value as TranslationId)
                }
              >
                <option value="WEB">WEB · offline default</option>
                <option value="CSB">CSB · online via API.Bible</option>
                <option value="NLT">NLT · online via API.Bible</option>
                <option value="MSG">MSG · online via API.Bible</option>
              </select>
              <p className="image-exact-text">{passage.verses[0].text}</p>
              <p className="fine-print">
                {passage.attribution || "World English Bible · Public domain"}
              </p>
            </div>
          </details>
          {translation !== "WEB" && passage.translation !== translation && (
            <p role="status" className="notice">
              {!online
                ? `${translation} needs an online connection. Your image uses exact WEB text.`
                : !state.onlineScripture
                  ? `Enable online Scripture in Settings to retrieve ${translation}. Your image uses exact WEB text.`
                  : `${translation} has not been retrieved. Your image uses exact WEB text until online access is available.`}{" "}
              <Link href="/settings#translation">Translation settings</Link>
            </p>
          )}
          {error && (
            <p role="alert" className="error-banner">
              {error}
            </p>
          )}
          <p className="fine-print">
            Made on your device. No image uploads or extra personal data stored.
          </p>
        </div>
      </div>
      <div className="image-export-bar">
        <div>
          <strong>Make it yours to carry.</strong>
          <small>High-resolution PNG · {passage.translation}</small>
        </div>
        <Button
          variant="outline"
          disabled={!file || !!error || sharing}
          onClick={() => {
            if (file) {
              saveImage(file);
              setMessage(
                "Image downloaded. On iPhone, open the download and choose Save Image to add it to Photos.",
              );
            }
          }}
        >
          <Download size={18} /> Save to device
        </Button>
        <Button disabled={!file || !!error || sharing} onClick={share}>
          <Share2 size={18} /> {sharing ? "Sharing…" : "Share"}
        </Button>
      </div>
      <p className="image-export-message" role="status" aria-live="polite">
        {message || (!file && !error ? "Preparing your image…" : "")}
      </p>
    </div>
  );
}
