import Link from "next/link";
export default function NotFound() {
  return (
    <div className="empty-state">
      <h1>A different path.</h1>
      <p>This page is not here.</p>
      <Link href="/today">Return to today</Link>
    </div>
  );
}
