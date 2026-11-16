"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useApp } from "@/components/provider";
import type { PassageType } from "@/lib/schemas";
import type { BiblePositionType } from "@/lib/client/bible-position";

export function useBiblePosition(options: {
  reference: string;
  verseView: boolean;
  pending: boolean;
  passage: PassageType;
  initial: { reference: string; verse: number; restore: boolean };
  onVerse: (verse: number) => void;
}) {
  const { state, update } = useApp();
  const [revision, setRevision] = useState(0);
  const latest = useRef(options);
  latest.current = options;
  const save = useRef(update);
  save.current = update;
  const last = useRef(JSON.stringify(state.biblePosition));
  const queued = useRef<BiblePositionType | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const restoredScroll = useRef<number | null>(null);
  const visibleVerse = useRef(options.initial.verse);
  const previousSource = useRef({
    reference: options.reference,
    text: options.passage.text,
    translation: options.passage.translation,
  });
  const restore = useRef<BiblePositionType | null>(
    options.initial.restore
      ? {
          reference: options.initial.reference,
          verse: options.initial.verse,
          verseView: options.verseView,
        }
      : null,
  );
  function remember(position: BiblePositionType) {
    clearTimeout(saveTimer.current);
    queued.current = null;
    const serialized = JSON.stringify(position);
    if (serialized === last.current) return;
    last.current = serialized;
    void save
      .current((old) => ({ ...old, biblePosition: position }))
      .catch(() => {
        last.current = "";
      });
  }
  function relocate(position: BiblePositionType) {
    visibleVerse.current = position.verse;
    restore.current = position;
    setRevision((n) => n + 1);
    remember(position);
    latest.current.onVerse(position.verse);
  }
  useLayoutEffect(() => {
    const before = previousSource.current;
    if (
      before.reference === options.reference &&
      (before.text !== options.passage.text ||
        before.translation !== options.passage.translation) &&
      !restore.current
    ) {
      restore.current = {
        reference: options.reference,
        verse: visibleVerse.current,
        verseView: options.verseView,
      };
    }
    previousSource.current = {
      reference: options.reference,
      text: options.passage.text,
      translation: options.passage.translation,
    };
  }, [
    options.reference,
    options.passage.text,
    options.passage.translation,
    options.verseView,
  ]);
  useEffect(() => {
    if (
      options.pending ||
      !restore.current ||
      restore.current.reference !== options.reference
    )
      return;
    const target = options.passage.verses.find(
      (v) =>
        v.verse <= restore.current!.verse &&
        (v.verseEnd ?? v.verse) >= restore.current!.verse,
    );
    if (!target) return;
    const expected = restore.current;
    let alive = true;
    void document.fonts.ready.then(() => {
      if (!alive || restore.current !== expected) return;
      const row = document.querySelector<HTMLElement>(
        `.bible-reader [data-bible-verse="${target.verse}"]`,
      );
      if (!row) return;
      row.scrollIntoView({ block: "start", behavior: "instant" });
      restoredScroll.current = window.scrollY;
      restore.current = null;
      visibleVerse.current = target.verse;
      latest.current.onVerse(target.verse);
      remember({ ...expected, verse: target.verse });
    });
    return () => {
      alive = false;
    };
    // Passage bytes/identity determine when the restored verse is really available.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    revision,
    options.reference,
    options.verseView,
    options.pending,
    options.passage.reference,
    options.passage.translation,
    options.passage.text,
  ]);
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const current = latest.current;
      if (current.pending || restore.current) return;
      if (restoredScroll.current === window.scrollY) return;
      restoredScroll.current = null;
      const rows = [
        ...document.querySelectorAll<HTMLElement>(
          ".bible-reader [data-bible-verse]",
        ),
      ];
      if (!rows.length) return;
      const row =
        rows.find((el) => el.getBoundingClientRect().bottom > 32) ??
        rows.at(-1)!;
      const verse = Number(row.dataset.bibleVerse);
      if (!Number.isInteger(verse) || verse < 1) return;
      visibleVerse.current = verse;
      current.onVerse(verse);
      const position = {
        reference: current.reference,
        verse,
        verseView: current.verseView,
      };
      if (JSON.stringify(position) === last.current) return;
      queued.current = position;
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        if (queued.current?.reference === latest.current.reference)
          remember(queued.current);
      }, 180);
    };
    const scroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const leaving = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      measure();
      if (queued.current) remember(queued.current);
    };
    const hidden = () => {
      if (document.visibilityState === "hidden") leaving();
    };
    const link = (event: MouseEvent) => {
      if ((event.target as Element).closest("a[href]")) leaving();
    };
    window.addEventListener("scroll", scroll, { passive: true });
    window.addEventListener("pagehide", leaving);
    document.addEventListener("visibilitychange", hidden);
    document.addEventListener("click", link, true);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(saveTimer.current);
      if (queued.current) remember(queued.current);
      window.removeEventListener("scroll", scroll);
      window.removeEventListener("pagehide", leaving);
      document.removeEventListener("visibilitychange", hidden);
      document.removeEventListener("click", link, true);
    };
    // Event handlers use refs so saving a newly visible verse does not reinstall listeners.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { remember, relocate };
}
