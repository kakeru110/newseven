import React from "react";
import {
  ComposedChart, Bar, Line, LineChart, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import { Card, Legend, ChartTooltip, axisProps } from "./ui.jsx";
import { yen, man, pct, monthShort, monthLong } from "../lib/format.js";

/**
 * 月次推移（CLAUDE.md §12-2）
 *
 * 仕様では「限界利益率と稼働率を第2軸」とあるが、2つの縦軸を1つのプロットに重ねると
 * 軸合わせが恣意的になり、存在しない相関が見えてしまう。
 * ここでは x 軸を共有した上下2段のパネルに分け、同じ読み取り（金額と率の対比）を保っている。
 * 仮値の月（2026-08）は、棒＝斜線ハッチ、折れ線＝破線で区別する。
 */
export default function MonthlyTrendChart({ months }) {
  const lastActual = months.reduce((acc, m, i) => (m.isProvisional ? acc : i), 0);

  const data = months.map((m, i) => {
    const prov = i >= lastActual;   // 実績最終点から破線をつなぐ
    return {
      month: m.month,
      label: monthShort(m.month),
      isProvisional: m.isProvisional,
      revenue: m.revenueTotal,
      cm: m.contributionMargin,
      op: m.operatingProfit,
      cmRate: m.contributionMarginRate * 100,
      occupancy: m.occupancyRate * 100,
      opSolid: m.isProvisional ? null : m.operatingProfit,
      opDashed: prov ? m.operatingProfit : null,
      cmRateSolid: m.isProvisional ? null : m.contributionMarginRate * 100,
      cmRateDashed: prov ? m.contributionMarginRate * 100 : null,
      occupancySolid: m.isProvisional ? null : m.occupancyRate * 100,
      occupancyDashed: prov ? m.occupancyRate * 100 : null,
    };
  });

  const hatch = (id, color, wash) => (
    <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="6" height="6" fill={wash} />
      <rect width="2.5" height="6" fill={color} />
    </pattern>
  );

  const barFill = (row, id, color) => (row.isProvisional ? `url(#${id})` : color);

  return (
    <Card
      title="月次推移（2026年2月〜8月）"
      note="斜線・破線は仮値の月"
      desc="上段は金額（売上・限界利益・営業損益）、下段は率（限界利益率・稼働率）。縦軸の単位が違うため2段に分けています。"
    >
      <div className="chart">
        <ResponsiveContainer width="100%" height={252}>
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
            <defs>
              {hatch("hatch-rev", "var(--series-1)", "var(--series-1-wash)")}
              {hatch("hatch-cm", "var(--series-2)", "var(--series-2-wash)")}
            </defs>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis {...axisProps} width={52} tickFormatter={man} />
            <ReferenceLine y={0} stroke="var(--axis)" />
            <Tooltip
              cursor={{ fill: "var(--surface-2)" }}
              content={(p) => (
                <ChartTooltip
                  {...p}
                  label={monthLong(p.payload?.[0]?.payload?.month || "")}
                  rows={(pl) => {
                    const d = pl[0].payload;
                    return [
                      ["売上", yen(d.revenue)],
                      ["限界利益", yen(d.cm)],
                      ["営業損益", yen(d.op)],
                    ];
                  }}
                  provisional={(pl) => pl[0].payload.isProvisional}
                />
              )}
            />
            <Bar dataKey="revenue" name="売上" fill="var(--series-1)" maxBarSize={26} radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {data.map((row) => <Cell key={row.month} fill={barFill(row, "hatch-rev", "var(--series-1)")} />)}
            </Bar>
            <Bar dataKey="cm" name="限界利益" fill="var(--series-2)" maxBarSize={26} radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {data.map((row) => <Cell key={row.month} fill={barFill(row, "hatch-cm", "var(--series-2)")} />)}
            </Bar>
            <Line dataKey="opSolid" name="営業損益" stroke="var(--series-3)" strokeWidth={2}
                  dot={{ r: 4, fill: "var(--series-3)", stroke: "var(--surface)", strokeWidth: 2 }} connectNulls={false} isAnimationActive={false} />
            <Line dataKey="opDashed" stroke="var(--series-3)" strokeWidth={2} strokeDasharray="5 4"
                  dot={{ r: 4, fill: "var(--surface)", stroke: "var(--series-3)", strokeWidth: 2 }} connectNulls={false} isAnimationActive={false} legendType="none" />
          </ComposedChart>
        </ResponsiveContainer>

        <ResponsiveContainer width="100%" height={186}>
          <LineChart data={data} margin={{ top: 12, right: 8, left: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis {...axisProps} width={52} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
            <Tooltip
              cursor={{ stroke: "var(--axis)" }}
              content={(p) => (
                <ChartTooltip
                  {...p}
                  label={monthLong(p.payload?.[0]?.payload?.month || "")}
                  rows={(pl) => {
                    const d = pl[0].payload;
                    return [
                      ["限界利益率", `${d.cmRate.toFixed(1)}%`],
                      ["稼働率", `${d.occupancy.toFixed(1)}%`],
                    ];
                  }}
                  provisional={(pl) => pl[0].payload.isProvisional}
                />
              )}
            />
            <Line dataKey="cmRateSolid" name="限界利益率" stroke="var(--series-1)" strokeWidth={2}
                  dot={{ r: 4, fill: "var(--series-1)", stroke: "var(--surface)", strokeWidth: 2 }} connectNulls={false} isAnimationActive={false} />
            <Line dataKey="cmRateDashed" stroke="var(--series-1)" strokeWidth={2} strokeDasharray="5 4"
                  dot={{ r: 4, fill: "var(--surface)", stroke: "var(--series-1)", strokeWidth: 2 }} connectNulls={false} isAnimationActive={false} />
            <Line dataKey="occupancySolid" name="稼働率" stroke="var(--series-2)" strokeWidth={2}
                  dot={{ r: 4, fill: "var(--series-2)", stroke: "var(--surface)", strokeWidth: 2 }} connectNulls={false} isAnimationActive={false} />
            <Line dataKey="occupancyDashed" stroke="var(--series-2)" strokeWidth={2} strokeDasharray="5 4"
                  dot={{ r: 4, fill: "var(--surface)", stroke: "var(--series-2)", strokeWidth: 2 }} connectNulls={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <Legend
        items={[
          { label: "売上", color: "var(--series-1)" },
          { label: "限界利益", color: "var(--series-2)" },
          { label: "営業損益（折れ線）", color: "var(--series-3)", type: "line" },
          { label: "下段: 限界利益率", color: "var(--series-1)", type: "line" },
          { label: "下段: 稼働率", color: "var(--series-2)", type: "line" },
          { label: "斜線・破線 = 仮値（2026年8月）", type: "hatch" },
        ]}
      />
    </Card>
  );
}
