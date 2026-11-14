"use client";
import { createContext, useContext, useEffect, useState, useRef } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useApp } from "./provider";
import { Button } from "./ui/button";
import { createPin, verifyPin } from "@/lib/client/pin";
const Context = createContext<{
  locked: boolean;
  lock: () => void;
  unlock: (pin: string) => Promise<boolean>;
  enable: (pin: string) => Promise<void>;
} | null>(null);
export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const { state, ready, update } = useApp();
  const [unlocked, setUnlocked] = useState(false);
  const attempts = useRef({ count: 0, until: 0 });
  const lock = () => setUnlocked(false);
  useEffect(() => {
    if (!state.pinLock) return;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setUnlocked(false), 300000);
    };
    const hidden = () => {
      if (document.visibilityState === "hidden") setUnlocked(false);
    };
    reset();
    window.addEventListener("pointerdown", reset);
    window.addEventListener("keydown", reset);
    window.addEventListener("pagehide", lock);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointerdown", reset);
      window.removeEventListener("keydown", reset);
      window.removeEventListener("pagehide", lock);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [state.pinLock]);
  const unlock = async (pin: string) => {
    if (Date.now() < attempts.current.until)
      throw new Error("Take a quiet minute, then try again.");
    if (!state.pinLock) return true;
    const ok = await verifyPin(pin, state.pinLock);
    if (ok) {
      attempts.current = { count: 0, until: 0 };
      setUnlocked(true);
    } else {
      attempts.current.count++;
      if (attempts.current.count >= 5) {
        attempts.current.until = Date.now() + 60000;
        attempts.current.count = 0;
      }
    }
    return ok;
  };
  const enable = async (pin: string) => {
    const record = await createPin(pin);
    // Keep the setup screen mounted when the PIN record becomes visible.
    setUnlocked(true);
    try {
      await update((s) => ({ ...s, pinLock: record }));
    } catch (error) {
      setUnlocked(false);
      throw error;
    }
  };
  return (
    <Context.Provider
      value={{
        locked: !ready || (!!state.pinLock && !unlocked),
        lock,
        unlock,
        enable,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function usePrivacy() {
  const v = useContext(Context);
  if (!v) throw new Error("Privacy context missing");
  return v;
}
export function PrivacyBoundary({ children }: { children: React.ReactNode }) {
  const { ready } = useApp();
  const { locked, unlock } = usePrivacy();
  const path = usePathname();
  const [pin, setPin] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  if (!ready) return <p className="loading">Preparing your quiet space…</p>;
  if (!locked || path === "/read") return children;
  return (
    <section className="lock-screen">
      <p className="eyebrow">YOUR QUIET SPACE</p>
      <h1>A little privacy.</h1>
      <p>
        Enter your PIN to open your journeys, journal, notes, and conversation.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const ok = await unlock(pin);
            setMessage(
              ok ? "" : "That PIN didn’t match. Try again when you’re ready.",
            );
            setPin("");
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label htmlFor="unlock-pin">Your PIN</label>
        <input
          id="unlock-pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          pattern="[0-9]{6,12}"
          minLength={6}
          maxLength={12}
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          required
        />
        <Button disabled={busy} type="submit">
          Open my space
        </Button>
        {message && <p role="alert">{message}</p>}
      </form>
      <Link className="text-link" href="/read">
        Read the public WEB Bible while locked
      </Link>
      <p className="fine-print">
        Forgotten PINs cannot be recovered here. This is a device screen lock,
        not encryption or server authentication.
      </p>
    </section>
  );
}
export function PinSettings() {
  const { state, update } = useApp();
  const { enable, lock } = usePrivacy();
  const [pin, setPin] = useState(""),
    [confirm, setConfirm] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="settings-card" id="privacy">
      <h2>A little privacy</h2>
      <p>
        Optional PIN screen lock for this browser, including hosted and
        shared-device use. It hides personal screens on reload, when the app is
        hidden, or after five quiet minutes.
      </p>
      <p className="field-hint">
        This hides the display; it does not encrypt browser storage, protect API
        requests, or sync a PIN to other devices. Someone with browser developer
        tools or device access can bypass it. Use device security and server
        authentication for stronger protection.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (pin !== confirm) {
            setMessage("The two PINs need to match.");
            return;
          }
          setBusy(true);
          try {
            await enable(pin);
            setPin("");
            setConfirm("");
            setMessage("Your PIN screen lock is ready on this device.");
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label htmlFor="new-pin">
          {state.pinLock ? "New PIN" : "Choose a PIN"} · 6–12 digits
        </label>
        <input
          id="new-pin"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          pattern="[0-9]{6,12}"
          minLength={6}
          maxLength={12}
          required
          value={pin}
          onChange={(e) => setPin(e.target.value)}
        />
        <label htmlFor="confirm-pin">Confirm PIN</label>
        <input
          id="confirm-pin"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          minLength={6}
          maxLength={12}
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <Button disabled={busy} type="submit">
          {state.pinLock ? "Change PIN" : "Enable PIN screen lock"}
        </Button>
      </form>
      {state.pinLock && (
        <div className="toolbar">
          <Button variant="outline" onClick={lock}>
            Lock now
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              await update((s) => ({ ...s, pinLock: null }));
              setMessage("PIN screen lock disabled on this device.");
            }}
          >
            Disable PIN screen lock
          </Button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
