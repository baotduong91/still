"use client";
import { useEffect, useState } from "react";
import { cloudStatusEvent } from "@/lib/ai/cloud-status";
import { readCloudStatus, type CloudNotice } from "@/lib/client/cloud-status";
import { useApp } from "./provider";
export function useCloudNotice() {
  const [notice, setNotice] = useState<CloudNotice | null>(null);
  useEffect(() => {
    const update = () => setNotice(readCloudStatus());
    update();
    window.addEventListener(cloudStatusEvent, update);
    return () => window.removeEventListener(cloudStatusEvent, update);
  }, []);
  return notice;
}
export function CloudFallbackNotice() {
  const { state } = useApp();
  const notice = useCloudNotice();
  if (state.provider !== "cloud" || !notice?.fallback) return null;
  return (
    <p className="notice" role="status">
      {notice.status === "rate-limited"
        ? "Groq is rate limited."
        : "Groq could not produce a verified answer."}{" "}
      Using guided study with exact retrieved Scripture. Your saved days remain
      available.
    </p>
  );
}
