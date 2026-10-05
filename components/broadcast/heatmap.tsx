"use client";

/**
 * Posting Heatmap
 *
 * Median views by weekday and hour of posting. Darker means a post published
 * in that slot typically gets more views; the number is in every cell's title
 * and in the screen-reader table.
 */

import { useMemo, useState } from "react";
import { compact } from "@/lib/format";
import { useThemeColors } from "@/components/broadcast/use-theme-colors";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Monday first, the way a posting week is planned.
const ORDER = [1, 2, 3, 4, 5, 6, 0];

function slotLabel(day: number, hour: number, cell?: { posts: number; medianViews: number }): string {
  const slot = `${DAYS[day]} ${String(hour).padStart(2, "0")}:00`;
  return cell
    ? `${slot} · ${cell.posts} post${cell.posts === 1 ? "" : "s"} · median ${compact(cell.medianViews)} views`
    : `${slot} · no posts`;
}

export default function Heatmap({
  cells,
  timeZone,
}: {
  cells: Array<{ day: number; hour: number; posts: number; medianViews: number }>;
  timeZone: string;
}) {
  const colors = useThemeColors();
  // The picked slot's key; its readout is worked out from the current cells.
  const [picked, setPicked] = useState<string | null>(null);
  const { lookup, max, best } = useMemo(() => {
    const lookup = new Map(cells.map((c) => [`${c.day}:${c.hour}`, c]));
    const max = Math.max(1, ...cells.map((c) => c.medianViews));
    const best = [...cells].filter((c) => c.posts >= 2).sort((a, b) => b.medianViews - a.medianViews)[0];
    return { lookup, max, best };
  }, [cells]);

  return (
    <div>
      <div className="-mx-1 -my-1 overflow-x-auto px-1 py-1">
        <div className="min-w-[560px]">
          <div className="grid grid-cols-[2.5rem_repeat(24,minmax(0,1fr))] gap-[3px]">
            <span />
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} className="text-center text-[10px] text-muted">
                {h % 3 === 0 ? String(h).padStart(2, "0") : ""}
              </span>
            ))}
            {ORDER.map((day) => (
              <div key={day} className="contents">
                <span className="self-center text-xs font-medium text-muted">{DAYS[day]}</span>
                {Array.from({ length: 24 }, (_, hour) => {
                  const cell = lookup.get(`${day}:${hour}`);
                  const strength = cell ? Math.sqrt(cell.medianViews / max) : 0;
                  const isBest = best && cell === best;
                  const key = `${day}:${hour}`;
                  const label = slotLabel(day, hour, cell);
                  const isPicked = picked === key;
                  return (
                    <button
                      type="button"
                      key={hour}
                      onClick={() => setPicked(isPicked ? null : key)}
                      aria-label={label}
                      aria-pressed={isPicked}
                      title={label}
                      className={`aspect-square rounded-[3px] ${
                        isPicked
                          ? "outline outline-2 outline-offset-1 outline-foreground"
                          : isBest
                            ? "ring-2 ring-offset-1 ring-offset-surface"
                            : ""
                      }`}
                      style={{
                        // Mixed into the surface colour, not opacity on the button
                        // itself, so the picked and focus outlines stay full strength.
                        backgroundColor: `color-mix(in srgb, ${cell ? colors.series : colors.grid} ${
                          (cell ? 0.18 + strength * 0.82 : 0.5) * 100
                        }%, ${colors.surface})`,
                        ...(isBest ? { ["--tw-ring-color" as string]: colors.accent } : {}),
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      {picked && (
        <p className="mt-3 text-sm font-medium text-foreground">
          {slotLabel(Number(picked.split(":")[0]), Number(picked.split(":")[1]), lookup.get(picked))}
        </p>
      )}
      <p className="mt-3 text-xs text-muted">
        {best
          ? `Best slot: ${DAYS[best.day]} around ${String(best.hour).padStart(2, "0")}:00 (${timeZone}), median ${compact(best.medianViews)} views over ${best.posts} posts. Stronger cells, more views.`
          : `Stronger cells mean more views per post. Times in ${timeZone}.`}
      </p>
      <table className="sr-only">
        <caption>Median views by weekday and hour posted</caption>
        <tbody>
          {cells.map((c) => (
            <tr key={`${c.day}:${c.hour}`}>
              <td>
                {DAYS[c.day]} {c.hour}:00
              </td>
              <td>{c.medianViews} median views</td>
              <td>{c.posts} posts</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
