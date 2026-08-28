import React from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, Legend, ChartTooltip, axisProps } from "./ui.jsx";
import { num, monthShort, monthLong } from "../lib/format.js";

/** ごみ袋トレンド（CLAUDE.md §12-6）: 袋数/滞在 と 袋数/泊 */
export default function GarbageTrendChart({ trend }) {
  const lastActual = trend.reduce((acc, g, i) => (g.isProvisional ? acc : i), 0);
  const data = trend.map((g, i) => {
    const prov = i >= lastActual;
    return {
      ...g,
      label: monthShort(g.month),
      perStaySolid: g.isProvisional ? null : g.bagsPerStay,
      perStayDashed: prov ? g.bagsPerStay : null,
      perNightSolid: g.isProvisional ? null : g.bagsPerNight,
      perNightDashed: prov ? g.bagsPerNight : null,
    };
  });

  return (
    <Card
      title="ごみ袋トレンド"
      note="破線は仮値"
      desc="1滞在あたり・1泊あたりの袋数。連泊増だけでは説明できない単調増加が続いている（800円/袋）。"
    >
      <div className="chart">
        <ResponsiveContainer width="100%" height={224}>
          <LineChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis {...axisProps} width={44} domain={[0, (max) => Math.ceil((max + 0.3) * 2) / 2]} tickFormatter={(v) => v.toFixed(1)} />
            <Tooltip
              cursor={{ stroke: "var(--axis)" }}
              content={(p) => (
                <ChartTooltip
                  {...p}
                  label={monthLong(p.payload?.[0]?.payload?.month || "")}
                  rows={(pl) => {
                    const d = pl[0].payload;
                    return [
                      ["袋数 / 滞在", `${num(d.bagsPerStay)} 袋`],
                      ["袋数 / 泊", `${num(d.bagsPerNight)} 袋`],
                      ["袋数（月合計）", `${d.bags} 袋`],
                    ];
                  }}
                  provisional={(pl) => !!pl[0].payload.isProvisional}
                />
              )}
            />
            <Line dataKey="perStaySolid" name="袋数/滞在" stroke="var(--series-1)" strokeWidth={2}
                  dot={{ r: 4, fill: "var(--series-1)", stroke: "var(--surface)", strokeWidth: 2 }} connectNulls={false} isAnimationActive={false} />
            <Line dataKey="perStayDashed" stroke="var(--series-1)" strokeWidth={2} strokeDasharray="5 4"
                  dot={{ r: 4, fill: "var(--surface)", stroke: "var(--series-1)", strokeWidth: 2 }} connectNulls={false} isAnimationActive={false} />
            <Line dataKey="perNightSolid" name="袋数/泊" stroke="var(--series-2)" strokeWidth={2}
                  dot={{ r: 4, fill: "var(--series-2)", stroke: "var(--surface)", strokeWidth: 2 }} connectNulls={false} isAnimationActive={false} />
            <Line dataKey="perNightDashed" stroke="var(--series-2)" strokeWidth={2} strokeDasharray="5 4"
                  dot={{ r: 4, fill: "var(--surface)", stroke: "var(--series-2)", strokeWidth: 2 }} connectNulls={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <Legend
        items={[
          { label: "袋数 / 滞在", color: "var(--series-1)", type: "line" },
          { label: "袋数 / 泊", color: "var(--series-2)", type: "line" },
          { label: "破線 = 仮値（2026年8月）", type: "hatch" },
        ]}
      />
    </Card>
  );
}
