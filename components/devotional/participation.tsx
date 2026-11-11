"use client";
import { useApp } from "@/components/provider";
import { localDate } from "@/lib/utils";
export function Participation() {
  const { state } = useApp();
  const dates = new Set(
    state.plans.flatMap((p) =>
      p.days.map((d) => d.completedDate).filter(Boolean),
    ),
  );
  return (
    <section className="notice" aria-label="Your participation">
      <strong>{dates.size} days you made space.</strong>
      <div className="toolbar">
        {Array.from({ length: 7 }, (_, i) => {
          const d = new Date();
          d.setDate(d.getDate() - 6 + i);
          return (
            <span
              key={i}
              aria-label={`${localDate(d)}: ${dates.has(localDate(d)) ? "participated" : "room to return"}`}
            >
              {dates.has(localDate(d)) ? "●" : "○"}{" "}
              {d.toLocaleDateString(undefined, { weekday: "narrow" })}
            </span>
          );
        })}
      </div>
      <p className="fine-print">
        Missed days never erase your progress. There is room to return.
      </p>
    </section>
  );
}
