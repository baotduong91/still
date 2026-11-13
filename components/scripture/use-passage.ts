"use client";
import { useEffect, useState } from "react";
import { useApp } from "@/components/provider";
import { api } from "@/lib/client/store";
import type { PassageType, TranslationId } from "@/lib/schemas";
import { isApiBibleTranslation } from "@/lib/bible/default-translation";
export function usePassage(local: PassageType, requested?: TranslationId) {
  const { state, online, bible } = useApp();
  const translation = requested ?? state.translation;
  const [remote, setRemote] = useState<PassageType | null>(null);
  const signature = local.reference + translation;
  useEffect(() => {
    let alive = true;
    setRemote(null);
    if (online && state.onlineScripture && isApiBibleTranslation(translation)) {
      if (local.source === "api.bible" && local.translation === translation)
        setRemote(local);
      else
        api<{ passage: PassageType }>(
          `scripture?${new URLSearchParams({ reference: local.reference, translation })}`,
        )
          .then((r) => {
            if (alive) setRemote(r.passage);
          })
          .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [signature, online, state.onlineScripture]);
  const safeLocal =
    local.source === "api.bible" && (!state.onlineScripture || !online)
      ? (bible?.lookup(local.reference, translation) ?? local)
      : local;
  const displayed =
    (remote?.requestedReference ?? remote?.reference) ===
      (local.requestedReference ?? local.reference) &&
    remote?.requestedTranslation === translation &&
    online &&
    state.onlineScripture
      ? remote
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
  return displayed;
}
