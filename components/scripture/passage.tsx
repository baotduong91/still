"use client";
import { Volume2, Square, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { PassageType } from "@/lib/schemas";
import { Button } from "@/components/ui/button";
export function exportVerse(p: PassageType) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const c = canvas.getContext("2d");
  if (!c) return;
  c.fillStyle = "#eff0e6";
  c.fillRect(0, 0, 1080, 1920);
  c.strokeStyle = "#9ca88a";
  c.lineWidth = 2;
  c.strokeRect(65, 65, 950, 1790);
  c.fillStyle = "#344b3c";
  c.textAlign = "center";
  c.font = "28px sans-serif";
  c.fillText("S T I L L   ·   D A I L Y  S C R I P T U R E", 540, 240);
  let font = 54,
    lines: string[] = [];
  const text = p.verses[0].text;
  do {
    c.font = `${font}px Georgia`;
    lines = [];
    let line = "";
    for (const word of text.split(" ")) {
      if (c.measureText(line + word).width > 820) {
        lines.push(line.trim());
        line = "";
      }
      line += word + " ";
    }
    lines.push(line.trim());
    font -= 2;
  } while (lines.length * (font + 20) > 1080 && font > 22);
  lines.forEach((line, i) => c.fillText(line, 540, 710 + i * (font + 22)));
  c.font = "25px sans-serif";
  c.fillText(
    `${p.verses[0].book} ${p.verses[0].chapter}:${p.verses[0].verse} · ${p.translation}`,
    540,
    1510,
  );
  c.font = "22px sans-serif";
  c.fillText("ONE FAITHFUL STEP AT A TIME", 540, 1720);
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "still-daily-verse.png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}
export function PassageCard({
  passage,
  compact = false,
}: {
  passage: PassageType;
  compact?: boolean;
}) {
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
      <div className="passage-actions">
        {audio && (
          <Button variant="ghost" size="sm" onClick={speak}>
            {speaking ? <Square size={15} /> : <Volume2 size={16} />}{" "}
            {speaking ? "Stop" : "Listen"}
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => exportVerse(passage)}>
          <Share2 size={15} /> Verse artwork
        </Button>
        <span className="exact-label">EXACT SCRIPTURE TEXT</span>
      </div>
    </div>
  );
}
