"use client";
import { useEffect, useState } from "react";
import { useApp } from "./provider";
import { Button } from "./ui/button";
type Status = {
  modes: {
    guided: { configured: boolean };
    ollama: { configured: boolean; hostedLoopback: boolean };
    cloud: { configured: boolean };
  };
  ollamaReachable: boolean | null;
};
export function ModeSettings() {
  const { state, update, online } = useApp();
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
        if (alive) setStatus(s);
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
          Cloud model
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
        <strong>Optional cloud</strong>
        <p className="field-hint">
          {status?.modes.cloud.configured
            ? "A cloud model is configured on this server."
            : "The host must set AI_GATEWAY_API_KEY and CLOUD_MODEL, then redeploy or restart."}{" "}
          Choosing cloud requires the explicit sharing choice below. Other modes
          never fall through to cloud.
        </p>
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
