"use client";
import Link from "@/components/smart-link";
import { usePassage } from "./use-passage";
import { Share2 } from "lucide-react";
import { ScriptureAudio } from "./audio-player";
import type { PassageType } from "@/lib/schemas";
import { Button } from "@/components/ui/button";
export function PassageCard({
  passage: localPassage,
  compact = false,
}: {
  passage: PassageType;
  compact?: boolean;
}) {
  const { passage, resolving } = usePassage(localPassage);
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
      <ScriptureAudio passage={passage} pending={resolving} />
      <div className="passage-actions">
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
