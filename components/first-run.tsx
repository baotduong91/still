"use client";
import Link from "next/link";
import { useApp } from "./provider";
import { Button } from "./ui/button";
export function FirstRun() {
  const { state, update } = useApp();
  if (state.setupSeen) return null;
  return (
    <aside className="first-run">
      <div>
        <strong>A quiet start, your way.</strong>
        <p>
          Guided study and WEB work without keys. Find local Ollama, optional
          cloud, Bible editions, and PIN privacy in Settings.
        </p>
      </div>
      <div className="toolbar">
        <Link className="text-link" href="/settings#answer-modes">
          Choose my preferences
        </Link>
        <Button
          variant="outline"
          onClick={() => update((s) => ({ ...s, setupSeen: true }))}
        >
          Continue with guided study
        </Button>
      </div>
    </aside>
  );
}
