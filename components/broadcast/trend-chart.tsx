"use client";

/**
 * Trend Chart
 *
 * One metric at a time over the selected range, the previous period dashed
 * behind it. Metric tabs above, the period totals beside them.
 */

import { useId, useMemo, useState } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Delta, Segmented } from "@/components/broadcast/primitives";
import { useThemeColors } from "@/components/broadcast/use-theme-colors";
import { change } from "@/lib/analytics/range";
import { compact, full, shortDate } from "@/lib/format";

export interface TrendMetric<Row> {
  key: string;
  label: string;
  value: (row: Row) => number | null;
  previous?: (row: Row) => number | null;
  /** Bars for counts that happen on a day; area for a running level. */
  kind?: "area" | "bar" | "line";
  /** How the headline total is formed: sum of days, or the last value. */
  total?: "sum" | "last";
}

export default function TrendChart<Row extends { date: string }>({
  rows,
  metrics,
  height = 280,
}: {
  rows: Row[];
  metrics: Array<TrendMetric<Row>>;
  height?: number;
}) {
  const colors = useThemeColors();
  const gradientId = useId().replace(/:/g, "");
  const [active, setActive] = useState(metrics[0]?.key ?? "");
  const metric = metrics.find((m) => m.key === active) ?? metrics[0];

  const data = useMemo(
    () =>
      rows.map((r) => ({
        date: r.date,
        current: metric.value(r),
        previous: metric.previous ? metric.previous(r) : null,
      })),
    [rows, metric]
  );

  const sum = (key: "current" | "previous") =>
    data.reduce((a, d) => a + (d[key] ?? 0), 0);
  const last = [...data].reverse().find((d) => d.current !== null)?.current ?? null;
  const headline = metric.total === "last" ? last : sum("current");
  const previousTotal = metric.previous ? sum("previous") : null;
  const delta =
    metric.total !== "last" && previousTotal !== null ? change(sum("current"), previousTotal) : undefined;

  // Thin the axis labels so a 90-day range stays legible.
  const interval = Math.max(0, Math.ceil(data.length / 8) - 1);
  const kind = metric.kind ?? "area";

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Segmented
          label="Metric"
          options={metrics.map((m) => ({ value: m.key, label: m.label }))}
          value={metric.key}
          onChange={setActive}
          size="sm"
        />
        <div className="flex items-baseline gap-3">
          <span className="font-display text-3xl font-bold leading-none text-foreground">
            {compact(headline)}
          </span>
          {delta !== undefined && <Delta value={delta} />}
          {previousTotal !== null && metric.total !== "last" && (
            <span className="text-xs text-muted">vs {compact(previousTotal)} before</span>
          )}
        </div>
      </div>

      <div style={{ height }} className="-ml-2">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 600, height: 260 }}>
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colors.seriesFill} stopOpacity={0.55} />
                <stop offset="100%" stopColor={colors.seriesFill} stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={colors.grid} strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(d: string) => shortDate(d)}
              interval={interval}
              tick={{ fill: colors.muted, fontSize: 11 }}
              axisLine={{ stroke: colors.grid }}
              tickLine={false}
              minTickGap={8}
            />
            <YAxis
              tickFormatter={(v: number) => compact(v)}
              tick={{ fill: colors.muted, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={44}
              domain={kind === "line" ? ["auto", "auto"] : [0, "auto"]}
            />
            <Tooltip
              cursor={{ stroke: colors.border, strokeWidth: 1 }}
              content={({ active: on, payload, label }) => {
                if (!on || !payload?.length) return null;
                const row = payload[0].payload as { current: number | null; previous: number | null };
                return (
                  <div className="rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-lg">
                    <p className="font-semibold text-foreground">{shortDate(String(label))}</p>
                    <p className="mt-1 text-foreground">
                      {metric.label}: <span className="font-semibold">{full(row.current)}</span>
                    </p>
                    {metric.previous && (
                      <p className="text-muted">Previous period: {full(row.previous)}</p>
                    )}
                  </div>
                );
              }}
            />
            {metric.previous && (
              <Line
                dataKey="previous"
                type="monotone"
                stroke={colors.rival}
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
                isAnimationActive={false}
              />
            )}
            {kind === "bar" ? (
              <Bar
                dataKey="current"
                fill={colors.seriesFill}
                stroke={colors.series}
                strokeWidth={1}
                radius={[3, 3, 0, 0]}
                maxBarSize={28}
                isAnimationActive={false}
              />
            ) : kind === "line" ? (
              <Line
                dataKey="current"
                type="monotone"
                stroke={colors.series}
                strokeWidth={2.5}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            ) : (
              <Area
                dataKey="current"
                type="monotone"
                stroke={colors.series}
                strokeWidth={2.5}
                fill={`url(#${gradientId})`}
                dot={false}
                activeDot={{ r: 4, fill: colors.series, stroke: colors.surface, strokeWidth: 2 }}
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {metric.previous && (
        <div className="mt-2 flex items-center gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded" style={{ background: colors.series }} />
            This period
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 border-t-2 border-dashed" style={{ borderColor: colors.rival }} />
            Previous period
          </span>
        </div>
      )}
    </div>
  );
}
