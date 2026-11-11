"use client";
import { useEffect } from "react";
import Link from "@/components/smart-link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Sun,
  Route,
  MessageCircle,
  NotebookPen,
  Settings,
  Leaf,
  WifiOff,
  X,
  Plus,
} from "lucide-react";
import { usePrivacy } from "./privacy";
import { Button } from "./ui/button";
import { useApp } from "./provider";
const links = [
  { href: "/today", label: "Today", Icon: Sun },
  { href: "/journey", label: "My journeys", Icon: Route },
  { href: "/scripture", label: "Scripture", Icon: BookOpen },
  { href: "/chat", label: "Bible chat", Icon: MessageCircle },
  { href: "/journal", label: "Journal", Icon: NotebookPen },
];
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const sync = () => {
      const offset = Math.max(
        0,
        window.innerHeight - viewport.height - viewport.offsetTop,
      );
      document.documentElement.dataset.keyboard =
        offset > 100 ? "open" : "closed";
      document.documentElement.style.setProperty(
        "--keyboard-offset",
        `${offset}px`,
      );
    };
    sync();
    viewport.addEventListener("resize", sync);
    viewport.addEventListener("scroll", sync);
    return () => {
      viewport.removeEventListener("resize", sync);
      viewport.removeEventListener("scroll", sync);
    };
  }, []);
  const { online, error, setError, state } = useApp();
  const { locked, lock } = usePrivacy();
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <Link href="/today" className="brand">
          <span className="brand-icon">
            <Leaf size={23} />
          </span>
          still<span className="brand-dot">.</span>
        </Link>
        <p className="brand-caption">A LITTLE CLOSER, EVERY DAY</p>
        <nav aria-label="Main navigation">
          {links.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              className={`nav-link ${path === href ? "active" : ""}`}
              aria-current={path === href ? "page" : undefined}
            >
              <Icon size={19} />
              {label}
              {path === href && <span className="nav-dot" />}
            </Link>
          ))}
        </nav>
        <Link href="/create" className="create-link">
          <Plus size={17} /> Create a journey
        </Link>
        <div className="sidebar-bottom">
          <div className="quiet-note">
            <Leaf size={20} />
            <p>
              No rush.
              <br />
              There is grace for today.
            </p>
          </div>
          <Link
            className={`nav-link ${path === "/settings" ? "active" : ""}`}
            href="/settings"
          >
            <Settings size={18} />
            Settings
          </Link>
          <p className="privacy-note">YOUR SPACE. PRIVATE BY DEFAULT.</p>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span className="topbar-word">MAKE SPACE FOR WHAT MATTERS</span>
          <span className="topbar-right">
            {!online ? (
              <>
                <WifiOff size={14} /> Offline · saved on this device
              </>
            ) : (
              <>
                <span className="status-dot" /> A quiet moment, just for you
              </>
            )}
          </span>
          {state.pinLock && !locked && (
            <Button variant="ghost" size="sm" onClick={lock}>
              Lock
            </Button>
          )}
          <Link
            href="/settings"
            className="mobile-settings"
            aria-label="Settings"
          >
            <Settings size={20} />
          </Link>
        </header>
        {error && !locked && (
          <div className="error-banner" role="alert">
            {error}
            <button onClick={() => setError("")} aria-label="Dismiss message">
              <X size={16} />
            </button>
          </div>
        )}
        <main id="main">{children}</main>
        <footer className="page-footer">
          <span>Rooted in Scripture. Made for your everyday.</span>
          <span>STILL · ONE FAITHFUL STEP</span>
        </footer>
      </div>
    </div>
  );
}
