import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, Legend, ChartTooltip, axisProps } from "./ui.jsx";
import { money, pct, num, monthShort, monthLong, signClass } from "../lib/format.js";

/**
 * チャネル別比較（CLAUDE.md §12-4）
 * 内訳の無い 2026-03・2026-08 は seed.channelMonths に含まれないため通算から除外される。
 */
export default function ChannelSection({ channels, monthlyRows }) {
  const target = channels[0]?.months || [];
  const chartData = monthlyRows.map((r) => ({
    label: monthShort(r.month),
    month: r.month,
    airbnb: r.airbnb ? r.airbnb.contributionPerNight : null,
    booking: r.booking ? r.booking.contributionPerNight : null,
  }));

  const metrics = [
    { label: "売上", get: (c) => money(c.revenue) + " 円" },
    { label: "泊数", get: (c) => `${c.nights} 泊` },
    { label: "予約件数", get: (c) => `${c.bookings} 件` },
    { label: "ADR", get: (c) => money(c.adr) + " 円" },
    { label: "OTA実料率", get: (c) => pct(c.otaRate, 2) },
    { label: "平均宿泊日数（ALOS）", get: (c) => `${num(c.alos)} 泊` },
    { label: "1泊あたり限界利益", get: (c) => money(c.contributionPerNight) + " 円", strong: true },
  ];

  return (
    <Card
      title="チャネル別比較"
      note={`対象: ${target.map(monthLong).join(" / ")}`}
      desc="内訳が取得できていない 2026年3月・8月は除外。1泊あたり限界利益 = ADR ×（1 − OTA実料率 − 運営サポート料11%）− 清掃単価 ÷ ALOS − 泊単価。"
    >
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>指標</th>
              {channels.map((c) => <th key={c.key}>{c.label}</th>)}
              <th className="col-total">差（Airbnb − Booking.com）</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((m) => {
              const vals = channels.map((c) => c.contributionPerNight);
              const diff = m.strong && channels.length === 2 ? vals[0] - vals[1] : null;
              return (
                <tr key={m.label} className={m.strong ? "grand" : ""}>
                  <td>{m.label}</td>
                  {channels.map((c) => <td key={c.key}>{m.get(c)}</td>)}
                  <td className="col-total">
                    {diff == null ? "" : <span className={signClass(diff)}>{money(diff)} 円</span>}
                  </td>
                </tr>
              );
            })}
            <tr>
              <td>直販</td>
              <td colSpan={channels.length + 1} style={{ textAlign: "left", color: "var(--muted)" }}>
                7ヶ月連続で0件。Booking.com の1泊を直販へ置き換えると、手数料分がそのまま限界利益になる。
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="chart" style={{ marginTop: 14 }}>
        <ResponsiveContainer width="100%" height={210}>
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis {...axisProps} width={56} tickFormatter={(v) => v.toLocaleString("ja-JP")} />
            <Tooltip
              cursor={{ fill: "var(--surface-2)" }}
              content={(p) => (
                <ChartTooltip
                  {...p}
                  label={`${monthLong(p.payload?.[0]?.payload?.month || "")} 1泊あたり限界利益`}
                  rows={(pl) => pl.map((s) => [s.dataKey === "airbnb" ? "Airbnb" : "Booking.com", `${money(s.value)} 円`])}
                />
              )}
            />
            <Bar dataKey="airbnb" name="Airbnb" fill="var(--series-1)" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="booking" name="Booking.com" fill="var(--series-2)" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <Legend
        items={[
          { label: "Airbnb", color: "var(--series-1)" },
          { label: "Booking.com", color: "var(--series-2)" },
        ]}
      />
    </Card>
  );
}
