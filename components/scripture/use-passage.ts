"use client";
import { useEffect, useState } from "react";
import { useApp } from "@/components/provider";
import { api } from "@/lib/client/store";
import type { PassageType, TranslationId } from "@/lib/schemas";
import { assertPassageText } from "@/lib/bible/integrity";
import { isApiBibleTranslation } from "@/lib/bible/default-translation";

export function usePassage(local: PassageType, requested?: TranslationId) {
  const { state, online, bible } = useApp();
  const translation = requested ?? state.translation;
  const reference = local.requestedReference ?? local.reference;
  const [revision, setRevision] = useState(0);
  const key = JSON.stringify([
    reference,
    translation,
    online,
    state.onlineScripture,
    revision,
  ]);
  const [result, setResult] = useState<{
    key: string;
    passage: PassageType | null;
    pending: boolean;
  } | null>(null);
  const wantsLicensed =
    online && state.onlineScripture && isApiBibleTranslation(translation);
  const hasLicensed =
    local.source === "api.bible" &&
    local.translation === translation &&
    local.citationScheme === "edition";
  const resolving =
    wantsLicensed && !hasLicensed && (result?.key !== key || result.pending);
  const retry = () => setRevision((n) => n + 1);
  useEffect(() => {
    if (!wantsLicensed || hasLicensed) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    setResult({ key, passage: null, pending: true });
    const retrieve = async (attempt: number) => {
      try {
        const { passage } = await api<{ passage: PassageType }>(
          `scripture?${new URLSearchParams({ reference, translation })}`,
          undefined,
          { signal: controller.signal },
        );
        assertPassageText(passage);
        if (
          (passage.requestedReference ?? passage.reference) !== reference ||
          passage.requestedTranslation !== translation
        )
          throw new Error(
            "The returned passage does not match the requested edition and reference.",
          );
        if (controller.signal.aborted) return;
        // A temporary WEB fallback is useful reading, not a successful licensed load.
        // Retry once, never loop on missing access or quota, and keep exact WEB available.
        const recover =
          attempt === 0 &&
          passage.fallback &&
          !/not configured|HTTP (?:401|403|429)|40 verses|bulk download/i.test(
            passage.notice,
          );
        setResult({ key, passage, pending: recover });
        if (recover) timer = setTimeout(() => void retrieve(1), 1500);
      } catch {
        if (controller.signal.aborted) return;
        if (attempt === 0) timer = setTimeout(() => void retrieve(1), 1500);
        else setResult({ key, passage: null, pending: false });
      }
    };
    void retrieve(0);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [key, wantsLicensed, hasLicensed, reference, translation]);
  // Revisit a failed load on return to a bookmarked/PWA window, without refetching
  // a successfully retrieved edition every time the user switches apps.
  useEffect(() => {
    const revisit = () => {
      if (
        document.visibilityState === "visible" &&
        wantsLicensed &&
        !hasLicensed &&
        result?.key === key &&
        !result.pending &&
        (!result.passage || result.passage.fallback)
      )
        setRevision((n) => n + 1);
    };
    window.addEventListener("pageshow", revisit);
    document.addEventListener("visibilitychange", revisit);
    return () => {
      window.removeEventListener("pageshow", revisit);
      document.removeEventListener("visibilitychange", revisit);
    };
  }, [key, result, wantsLicensed, hasLicensed]);
  const safeLocal =
    bible &&
    (local.translation !== translation ||
      (local.source === "api.bible" && (!wantsLicensed || !hasLicensed)))
      ? bible.lookup(reference, translation)
      : local;
  const remote = result?.key === key ? result.passage : null;
  const displayed =
    wantsLicensed && remote
      ? remote
      : safeLocal.fallback && isApiBibleTranslation(translation)
        ? {
            ...safeLocal,
            notice: !online
              ? `${translation} needs a connection. Showing exact ${safeLocal.translation} text offline.`
              : !state.onlineScripture
                ? `${translation} online access is off. Showing exact ${safeLocal.translation} text.`
                : resolving
                  ? `Loading ${translation}. Showing exact ${safeLocal.translation} text until it is ready.`
                  : `${translation} could not be loaded. Showing exact ${safeLocal.translation} text; you can retry online.`,
          }
        : safeLocal;
  useEffect(() => {
    if (!state.onlineScripture || !online || displayed.source !== "api.bible")
      return;
    // Required Scripture usage reporting, explicitly opted into in Settings. No third-party SDK.
    let device = localStorage.getItem("still-scripture-device");
    if (!device) {
      device = crypto.randomUUID();
      localStorage.setItem("still-scripture-device", device);
    }
    let session = sessionStorage.getItem("still-scripture-session");
    if (!session) {
      session = crypto.randomUUID();
      sessionStorage.setItem("still-scripture-session", session);
    }
    for (const token of displayed.fumsTokens ?? []) {
      const url = new URL("https://fums.api.bible/f3");
      url.searchParams.set("t", token);
      url.searchParams.set("dId", device);
      url.searchParams.set("sId", session);
      void fetch(url, {
        mode: "no-cors",
        credentials: "omit",
        referrerPolicy: "no-referrer",
      }).catch(() => {});
    }
  }, [displayed, state.onlineScripture, online]);
  return { passage: displayed, resolving, retry };
}
