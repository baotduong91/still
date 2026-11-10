"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="empty-state">
      <h1>Let’s take a breath.</h1>
      <p>This page could not load. Your saved words remain on this device.</p>
      <button className="button button-primary" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
