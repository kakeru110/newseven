import React, { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, Legend, ChartTooltip, axisProps } from "./ui.jsx";
import { yen, money, man, pct, monthShort, monthLong, signClass } from "../lib/format.js";
import { summarize, compareWithSeed, CHANNEL_LABEL } from "../lib/beds24.js";

const daysInMonth = (ym) => { const p = ym.split("-"); return new Date(+p[0], +p[1], 0).getDate(); };
const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };

/**
 * Beds24 由来の当月速報と先行予約（CLAUDE.md §8 Stage 2）
 *
 * 収支表PDFは翌月初にしか届かないため、当月は seed 上すべて仮値になる。
 * Beds24 の予約データは当日時点の実績なので、待たずに確定値に近い数字が出せる。
 * 先行予約（今月以降）は収支表PDFには原理的に存在しない情報。
 */
export default function LiveSection({ seed, live: state }) {
  const summary = useMemo(
    () => (state.status === "ok" ? summarize(seed, state.data.bookings) : null),
    [state, seed]
  );

  if (state.status !== "ok") {
    return (
      <Card title="Beds24 連携" note={state.status === "loading" ? "取得中" : "未接続"}>
        <p className="desc" style={{ marginBottom: 0 }}>
          {state.status === "loading"
            ? "予約データを取得しています…"
            : `${state.message}　ローカル開発では /api が動かないため、この表示になります。`}
        </p>
      </Card>
    );
  }

  const now = thisMonth();
  const current = summary.months.find((m) => m.month === now);
  const seedCurrent = seed.monthly.find((m) => m.month === now);
  const ahead = summary.months.filter((m) => m.month >= now);
  const rows = compareWithSeed(seed, summary).filter((r) => r.hasSeed);
  const corrections = summary.corrections.length;
  const cancelByMonth = Object.fromEntries(summary.months.map((m) => [m.month, m.cancelled]));
  const anomalies = summary.anomalies.length;

  const chartData = ahead.map((m) => ({
    month: m.month,
    label: monthShort(m.month),
    revenue: Math.round(m.revenue),
    nights: m.nights,
    bookings: m.bookings,
    occupancy: (m.nights / daysInMonth(m.month)) * 100,
  }));

  const tiles = current
    ? [
        { label: "売上（予約データ由来）", value: yen(current.revenue), sub: seedCurrent ? `seed の仮値 ${money(seedCurrent.revenue.total)}円` : "" },
        { label: "泊数", value: `${current.nights} 泊`, sub: `稼働率 ${pct(current.nights / daysInMonth(now))}` },
        { label: "予約件数", value: `${current.bookings} 件`, sub: `清掃 ${current.bookings} 回ぶん` },
        { label: "OTA手数料", value: yen(current.commission), sub: `実料率 ${pct(current.effectiveRate, 2)}` },
        { label: "キャンセル", value: `${current.cancelled} 件`, sub: `キャンセル率 ${pct(current.cancelRate, 1)}` },
      ]
    : [];

  return (
    <>
      <Card
        title={`Beds24 速報（${monthLong(now)}）`}
        note={`取得 ${new Date(state.data.fetchedAt).toLocaleString("ja-JP")}`}
        desc="収支表PDFを待たずに、当日時点の予約データから算出した値。手数料は Beds24 の実額です。"
      >
        {current ? (
          <div className="grid kpi" style={{ marginBottom: 12 }}>
            {tiles.map((t) => (
              <div className="card tile" key={t.label} style={{ boxShadow: "none", background: "var(--surface-2)" }}>
                <div className="label">{t.label}</div>
                <div className="value">{t.value}</div>
                {t.sub && <div className="sub">{t.sub}</div>}
              </div>
            ))}
          </div>
        ) : (
          <p className="desc">当月の予約はまだありません。</p>
        )}

        <div className="chart">
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--grid)" />
              <XAxis dataKey="label" {...axisProps} />
              <YAxis {...axisProps} width={52} tickFormatter={man} />
              <Tooltip
                cursor={{ fill: "var(--surface-2)" }}
                content={(p) => (
                  <ChartTooltip
                    {...p}
                    label={`${monthLong(p.payload?.[0]?.payload?.month || "")} 時点の予約済み`}
                    rows={(pl) => {
                      const d = pl[0].payload;
                      return [
                        ["売上", yen(d.revenue)],
                        ["泊数", `${d.nights} 泊`],
                        ["予約件数", `${d.bookings} 件`],
                        ["稼働率", pct(d.occupancy / 100)],
                      ];
                    }}
                  />
                )}
              />
              <Bar dataKey="revenue" name="予約済み売上" fill="var(--series-1)" maxBarSize={26} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <Legend items={[{ label: "先行予約（今月以降・すでに入っている予約の合計）", color: "var(--series-1)" }]} />
      </Card>

      <Card
        title="収支表PDFとの突合"
        note={`補正 ${corrections}件 ・ 要調査 ${anomalies}件`}
        desc="Beds24 の売上は Booking.com の一部予約で実額の 11/12 になることがあるため、手数料と料率から検算して補正しています。"
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>月</th>
                <th className="num">Beds24 売上</th>
                <th className="num">収支表</th>
                <th className="num">差</th>
                <th className="num">Beds24 手数料</th>
                <th className="num">収支表</th>
                <th className="num">差</th>
                <th className="num">11/12 補正</th>
                <th className="num">キャンセル</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.month}>
                  <td>{monthLong(r.month)}</td>
                  <td>{money(r.beds24Revenue)}</td>
                  <td>{money(r.seedRevenue)}</td>
                  <td className={signClass(r.revenueDiff)}>{money(r.revenueDiff)}</td>
                  <td>{money(r.beds24Commission)}</td>
                  <td>{money(r.seedCommission)}</td>
                  <td className={signClass(r.commissionDiff)}>{money(r.commissionDiff)}</td>
                  <td>{r.corrections ? `${r.corrections}件` : "—"}</td>
                  <td>{cancelByMonth[r.month] ? `${cancelByMonth[r.month]}件` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="footnotes">
          <li>OTA手数料は Beds24 に実額で入っており、全期間で収支表と一致しています（差は最大20円）。</li>
          <li>11/12 の過少計上は 2026年2〜4月の Booking.com 予約で発生し、5月以降は解消しています。</li>
          <li>
            キャンセルは Beds24 の既定の取得に含まれないため、`status=cancelled` を明示して別途取得しています。
            全期間で {summary.cancelled.length}件・{pct(summary.cancelRate, 1)}（Booking.com 表示の 20.0〜21.8% と整合）。売上には含めていません。
          </li>
          {summary.anomalies.map((a) => (
            <li key={a.id}>
              {monthLong(a.month)} 予約ID {a.id} は実料率 {pct(a.rate, 2)} と想定外のため補正していません（市税を含み金額が丸められている予約）。
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
