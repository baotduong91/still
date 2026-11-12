"use client";
import { useEffect, useState } from "react";
import { useApp } from "./provider";
import { Button } from "./ui/button";
import { useCloudNotice } from "./cloud-status";
import {
  recordCloudStatus,
  recordCloudVendor,
} from "@/lib/client/cloud-status";
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
export function ModeSettings() {
  const { state, update, online } = useApp();
  const cloudNotice = useCloudNotice();
  const [consent, setConsent] = useState(state.cloudConsent);
  useEffect(() => setConsent(state.cloudConsent), [state.cloudConsent]);
  const [status, setStatus] = useState<Status | null>(null),
    [message, setMessage] = useState("");
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
      <label htmlFor="provider">Guide</label>
      <select
        id="provider"
        value={state.provider}
        onChange={(e) => {
          setConsent(false);
          return update((s) => ({
            ...s,
            provider: e.target.value as typeof s.provider,
            cloudConsent: false,
          }));
        }}
      >
        <option value="curated">Guided study · offline · no keys</option>
        <option value="ollama" disabled={!status?.modes.ollama.configured}>
          Local Mac · Ollama
          {status?.modes.ollama.configured
            ? " · configured"
            : " · setup needed"}
        </option>
        <option value="cloud" disabled={!status?.modes.cloud.configured}>
          Cloud{status?.modes.cloud.vendor === "groq" ? " · Groq" : " model"}
          {status?.modes.cloud.configured ? " · configured" : " · setup needed"}
        </option>
      </select>
      <p className="field-hint">
        Guided: reviewed topics and specific passages with local WEB. Ollama:
        open-ended Bible questions on the Mac running Still. Cloud: open-ended
        answers from your configured hosted model. Every mode retrieves exact
        Scripture separately from interpretation.
      </p>
      <div className="notice">
        <strong>Local Mac · Ollama</strong>
        <p className="field-hint">
          {status?.modes.ollama.hostedLoopback
            ? "This hosted app cannot reach Ollama on your Mac through localhost. Run Still on your Mac using npm run dev and configure OLLAMA_MODEL in .env."
            : status?.modes.ollama.configured
              ? "Configured on this app server. Check the installed model before using it."
              : "Set OLLAMA_MODEL and OLLAMA_BASE_URL on the Mac running Still, then restart the app."}
        </p>
        <Button
          variant="outline"
          disabled={!status?.modes.ollama.configured}
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
      <div className="notice">
        <strong>
          {status?.modes.cloud.vendor === "groq"
            ? "Optional cloud · Groq"
            : "Optional cloud"}
        </strong>
        <p className="field-hint">
          {status?.modes.cloud.configured
            ? status.modes.cloud.vendor === "groq"
              ? "Groq is configured. Guided study keeps cloud off until you choose it."
              : "A cloud model is configured on this server."
            : "For the simplest cloud setup, add GROQ_API_KEY on the server and redeploy or restart. The existing AI_GATEWAY_API_KEY + CLOUD_MODEL setup also works."}{" "}
          Choosing cloud requires the explicit sharing choice below. Other modes
          never fall through to cloud.
        </p>
        {status?.modes.cloud.vendor === "groq" &&
          status.modes.cloud.configured && (
            <>
              <Button
                variant="outline"
                disabled={!online}
                onClick={async () => {
                  try {
                    const response = await fetch("/api/modes?check=groq");
                    const checked = (await response.json()) as Status;
                    recordCloudStatus(checked.groqStatus ?? "unavailable");
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
                      : "Connection not checked. This check sends no personal prompt."}
              </p>
              <p className="field-hint">
                If Groq is rate limited or unreachable, Still uses a labelled
                guided WEB response. It never sends your prompt to a different
                cloud service or to Ollama automatically.
              </p>
            </>
          )}
        {state.provider === "cloud" && (
          <label>
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => {
                const checked = e.target.checked;
                setConsent(checked);
                void update((s) => ({ ...s, cloudConsent: checked })).catch(
                  () => setConsent(false),
                );
              }}
            />{" "}
            I choose to send my questions, goals, recent chat context, and
            retrieved passages to the configured cloud model.
          </label>
        )}
      </div>
      <p className="fine-print">
        Model choices take effect on your next question or new journey. Saved
        plans remain readable offline. Full setup: docs/MODES.md in the source
        project.
      </p>
    </section>
  );
}
