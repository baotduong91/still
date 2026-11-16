"use client";
import { useEffect, useRef } from "react";
import { LoaderCircle } from "lucide-react";

/** Native modal makes the rest of the app inert, including keyboard navigation. */
export function GenerationModal({ busy }: { busy: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!busy || !dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [busy]);
  return (
    <dialog
      ref={ref}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Tab") {
          event.preventDefault();
          ref.current?.focus();
        }
      }}
      className="generation-modal"
      aria-labelledby="generation-title"
      aria-describedby="generation-description"
      onCancel={(event) => event.preventDefault()}
    >
      <LoaderCircle className="audio-loading" size={28} aria-hidden="true" />
      <h2 id="generation-title">Preparing your journey</h2>
      <p id="generation-description" role="status">
        Finding Scripture and shaping your days. Your prompt is held safely
        while we finish.
      </p>
      <p className="fine-print">
        This can take a little time. Please keep this window open.
      </p>
    </dialog>
  );
}
