"use client";
import Link from "@/components/smart-link";
import { usePassage } from "./use-passage";
import { Volume2, Square, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { PassageType } from "@/lib/schemas";
import { Button } from "@/components/ui/button";
export function PassageCard({
  passage: localPassage,
  compact = false,
}: {
  passage: PassageType;
  compact?: boolean;
}) {
  const passage = usePassage(localPassage);
  const [speaking, setSpeaking] = useState(false);
  const [audio, setAudio] = useState(false);
  useEffect(() => {
    setAudio("speechSynthesis" in window);
    return () => {
      window.speechSynthesis?.cancel();
    };
  }, []);
  function speak() {
    if (speaking) {
      speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(passage.text);
    utterance.lang = "en-US";
    utterance.rate = 0.85;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    speechSynthesis.speak(utterance);
    setSpeaking(true);
  }
  return (
    <div className={`passage ${compact ? "compact" : ""}`}>
      <div className="eyebrow">
        {passage.reference} <span>· {passage.translation}</span>
      </div>
      <blockquote>
        {passage.verses.map((v) => (
          <span key={v.verse}>
            <sup>{v.verse}</sup>
            {v.text}{" "}
          </span>
        ))}
      </blockquote>
      {passage.fallback && (
        <p className="translation-notice">{passage.notice}</p>
      )}
      {passage.attribution && (
        <p className="translation-notice">{passage.attribution}</p>
      )}
      <div className="passage-actions">
        {audio && (
          <Button variant="ghost" size="sm" onClick={speak}>
            {speaking ? <Square size={15} /> : <Volume2 size={16} />}{" "}
            {speaking ? "Stop" : "Listen"}
          </Button>
        )}
        <Button variant="ghost" size="sm" asChild>
          <Link
            href={`/create-image?${new URLSearchParams({ ref: passage.reference, translation: passage.requestedTranslation })}`}
          >
            <Share2 size={15} /> Create Image
          </Link>
        </Button>
        <span className="exact-label">EXACT SCRIPTURE TEXT</span>
      </div>
    </div>
  );
}
