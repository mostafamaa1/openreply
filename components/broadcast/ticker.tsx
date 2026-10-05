"use client";

/**
 * Lower-third Ticker
 *
 * The latest events scrolling along the foot of the dashboard, the way a
 * broadcast runs results under the picture. Pauses under the pointer or
 * keyboard focus; with reduced motion it is a strip you scroll yourself.
 */

export interface TickerItem {
  id: string;
  label: string;
  text: string;
  tone?: "gain" | "loss" | "neutral";
}

export default function Ticker({ title, items }: { title: string; items: TickerItem[] }) {
  if (items.length === 0) return null;
  // Two copies, so the loop is seamless at -50%.
  const loop = [...items, ...items];
  return (
    <section
      aria-label={title}
      className="flex items-stretch overflow-hidden rounded-lg bg-bar text-bar-fg"
    >
      <p className="flex shrink-0 items-center gap-2 bg-accent px-3 font-display text-sm font-bold uppercase tracking-wider text-on-accent sm:px-4">
        <span className="h-2 w-2 rounded-full bg-on-accent" aria-hidden="true" />
        {title}
      </p>
      <div className="ticker min-w-0 flex-1 py-2.5" tabIndex={0}>
        <ul className="ticker-track gap-8 pl-6">
          {loop.map((item, i) => (
            <li
              key={`${item.id}-${i}`}
              aria-hidden={i >= items.length}
              className="flex shrink-0 items-center gap-2 whitespace-nowrap text-sm"
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  item.tone === "gain"
                    ? "bg-bar-gain"
                    : item.tone === "loss"
                      ? "bg-bar-loss"
                      : "bg-bar-muted"
                }`}
              />
              <span className="font-semibold">{item.label}</span>
              <span className="text-bar-muted">{item.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
