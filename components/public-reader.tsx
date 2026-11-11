"use client";
import { useEffect, useState } from "react";
import { Bible, type Corpus } from "@/lib/bible";
import type { PassageType } from "@/lib/schemas";
import { Button } from "./ui/button";
export function PublicReader() {
  const [bible, setBible] = useState<Bible | null>(null),
    [query, setQuery] = useState("Psalms 23"),
    [passage, setPassage] = useState<PassageType | null>(null),
    [message, setMessage] = useState("");
  useEffect(() => {
    let alive = true;
    fetch("/bibles/WEB.json")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((c: Corpus) => {
        if (alive) {
          const b = new Bible(c);
          setBible(b);
          setPassage(b.lookup("Psalms 23", "WEB"));
        }
      })
      .catch(() =>
        setMessage("Connect once and download WEB for offline reading."),
      );
    return () => {
      alive = false;
    };
  }, []);
  return (
    <section className="narrow-page">
      <p className="eyebrow">PUBLIC WEB READER · NO PERSONAL NOTES</p>
      <h1>Room for the Word.</h1>
      <form
        className="search-bar"
        onSubmit={(e) => {
          e.preventDefault();
          try {
            setPassage(bible!.lookup(query, "WEB"));
            setMessage("");
          } catch {
            setMessage("Try a reference such as John 3:16 or Psalms 23.");
          }
        }}
      >
        <label className="sr-only" htmlFor="public-reference">
          Public Bible reference
        </label>
        <input
          id="public-reference"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button disabled={!bible}>Read</Button>
      </form>
      {message && <p role="status">{message}</p>}
      {passage && (
        <article className="reader-paper">
          <h2>{passage.reference}</h2>
          {passage.verses.map((v) => (
            <p className="public-verse" key={v.verse}>
              <sup>{v.verse}</sup> {v.text}
            </p>
          ))}
          <p className="fine-print">
            World English Bible · Public domain · eBible.org
          </p>
        </article>
      )}
    </section>
  );
}
