"use client";
import { useEffect, useState } from "react";
import { useApp } from "./provider";
import { Button } from "./ui/button";
import { useCloudNotice } from "./cloud-status";
import {
  recordCloudStatus,
  recordCloudVendor,
} from "@/lib/client/cloud-status";
import { hostedGroqAvailable } from "@/lib/client/hosted-groq";
import type { CloudStatus } from "@/lib/ai/cloud-status";
type Status = {
  modes: {
    guided: { configured: boolean };
    ollama: { configured: boolean; hostedLoopback: boolean };
    cloud: { configured: boolean; vendor?: "groq" | "gateway" };
  };
  ollamaReachable: boolean | null;
  groqStatus?: CloudStatus | null;
};
function applyGuide(
  value: "curated" | "ollama" | "cloud",
  groq: boolean,
): Pick<
  import("@/lib/client/store").SavedState,
  "provider" | "cloudConsent" | "guidePreferenceSet"
> {
  return {
    provider: value,
    cloudConsent: value === "cloud" && groq,
    guidePreferenceSet: true,
  };
}
export function ModeSettings() {
  const { state, update, online } = useApp();
  const cloudNotice = useCloudNotice();
  const [status, setStatus] = useState<Status | null>(null),
    [message, setMessage] = useState("");
  const groq = status ? hostedGroqAvailable(status) : false;
  const cloudReady = status?.modes.cloud.configured !== false;
  useEffect(() => {
    let alive = true;
    fetch("/api/modes")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((s) => {
        if (alive) {
          setStatus(s);
          recordCloudVendor(s.modes.cloud.vendor);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [online]);
  return (
    <section className="settings-card">
      <h2>Your answer mode</h2>
      <label htmlFor="provider">
        {groq ? "How should journeys be written?" : "Guide"}
      </label>
      <select
        id="provider"
        value={state.provider}
        onChange={(e) => {
          const value = e.target.value as typeof state.provider;
          return update((s) => ({ ...s, ...applyGuide(value, groq) }));
        }}
      >
        {groq && (
          <>
            <option value="cloud" disabled={!cloudReady}>
              Custom journeys & chat · Groq
              {!cloudReady ? " · checking…" : " · ready"}
            </option>
            <option value="curated">Guided study only · local WEB</option>
          </>
        )}
        {!groq && (
          <>
            <option value="curated">Guided study · offline · no keys</option>
            <option value="ollama" disabled={!status?.modes.ollama.configured}>
              Local Mac · Ollama
              {status?.modes.ollama.configured
                ? " · configured"
                : " · setup needed"}
            </option>
            <option value="cloud" disabled={!status?.modes.cloud.configured}>
              Cloud model
              {status?.modes.cloud.configured
                ? " · configured"
                : " · setup needed"}
            </option>
          </>
        )}
      </select>
      <p className="field-hint">
        {groq
          ? "Custom: your prompt shapes a multi-day journey; exact verses stay on Still. Guided: reviewed paths only, works offline, nothing is sent to Groq."
          : "Guided uses local WEB. Ollama and cloud need extra setup."}
      </p>
      {groq && state.provider === "cloud" && (
        <p className="field-hint fine-print">
          By using Create or Chat, you send your goal, questions, and retrieved
          passages to Groq. Choose Guided above to keep prompts on this device
          only.
        </p>
      )}
      {status?.modes.ollama.configured && !status.modes.ollama.hostedLoopback && (
        <OllamaNotice
          status={status}
          message={message}
          setMessage={setMessage}
          setStatus={setStatus}
        />
      )}
      {groq && (
        <GroqNotice
          cloudNotice={cloudNotice}
          online={online}
          setStatus={setStatus}
        />
      )}
      {!groq && status?.modes.cloud.configured && state.provider === "cloud" && (
        <label>
          <input
            type="checkbox"
            checked={state.cloudConsent}
            onChange={(e) => {
              const checked = e.target.checked;
              void update((s) => ({
                ...s,
                cloudConsent: checked,
                guidePreferenceSet: true,
              }));
            }}
          />{" "}
          I choose to send my questions, goals, recent chat context, and
          retrieved passages to the configured cloud model.
        </label>
      )}
      <p className="fine-print">
        Saved plans stay on this device. Offline reading does not use Groq.
      </p>
    </section>
  );
}
function OllamaNotice({
  status,
  message,
  setMessage,
  setStatus,
}: {
  status: Status;
  message: string;
  setMessage: (m: string) => void;
  setStatus: (s: Status) => void;
}) {
  return (
    <div className="notice">
      <strong>Local Mac · Ollama</strong>
      <p className="field-hint">
        Configured on this app server. Check the installed model before using
        it.
      </p>
      <Button
        variant="outline"
        disabled={!status.modes.ollama.configured}
        onClick={async () => {
          setMessage("Checking Ollama without sending a prompt…");
          try {
            const r = await fetch("/api/modes?check=ollama");
            const s = (await r.json()) as Status;
            setStatus(s);
            setMessage(
              s.ollamaReachable
                ? "Ollama is reachable and the configured model is installed."
                : "Ollama is unavailable or the configured model is not installed. No cloud request was made.",
            );
          } catch {
            setMessage(
              "Could not reach the app server. No cloud request was made.",
            );
          }
        }}
      >
        Check Ollama connection
      </Button>
      {message && (
        <p role="status" className="field-hint">
          {message}
        </p>
      )}
    </div>
  );
}
function GroqNotice({
  cloudNotice,
  online,
  setStatus,
}: {
  cloudNotice: ReturnType<typeof useCloudNotice>;
  online: boolean;
  setStatus: (s: Status) => void;
}) {
  return (
    <div className="notice">
      <strong>Optional · Groq connection</strong>
      <Button
        variant="outline"
        disabled={!online}
        onClick={async () => {
          try {
            const response = await fetch("/api/modes?check=groq");
            const checked = (await response.json()) as Status;
            recordCloudStatus(checked.groqStatus ?? "unavailable");
            setStatus(checked);
          } catch {
            recordCloudStatus("unavailable");
          }
        }}
      >
        Check Groq connection
      </Button>
      <p className="field-hint" role="status">
        {cloudNotice?.status === "connected"
          ? "Groq connected"
          : cloudNotice?.status === "rate-limited"
            ? "Groq rate limited · guided study remains available"
            : cloudNotice?.status === "unavailable"
              ? "Groq unavailable · guided study remains available"
              : "Optional check only; no personal text is sent."}
      </p>
    </div>
  );
}
