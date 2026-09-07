import React, { useMemo } from "react";
import { yen, pct, money, num, monthLong } from "../lib/format.js";
import { onTheBooks } from "../lib/forecast.js";
import { fiscalYear } from "../lib/regulation.js";

const pad = (n) => String(n).padStart(2, "0");
const addMonths = (month, n) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

/**
 * サマリーカード（CLAUDE.md §12-1）
 *
 * 確定値（収支表PDF由来）と、その先の予約済み（Beds24由来）を分けて出す。
 * 出所も確からしさも違うので合算した数字だけを大きく出さない。
 * 「通算」は seed の最終月までで、それ以降は「予約済み」に入る。
 */
export default function SummaryCards({ totals, months, live }) {
  const first = months[0].month, last = months[months.length - 1].month;

  /* 確定値の翌月から年度末までの、いま入っている予約 */
  const booked = useMemo(() => {
    if (!live || live.status !== "ok") return null;
    const today = new Date().toISOString().slice(0, 10);
    const end = fiscalYear(today).end.slice(0, 7);
    const list = [];
    for (let m = addMonths(last, 1); m <= end; m = addMonths(m, 1)) list.push(m);
    if (!list.length) return null;
    const sum = list
      .map((m) => onTheBooks(live.data.bookings, m, today))
      .reduce((a, r) => ({ revenue: a.revenue + r.revenue, nights: a.nights + r.nights }), { revenue: 0, nights: 0 });
    return { ...sum, from: list[0], to: list[list.length - 1] };
  }, [live, last]);

  const cards = [
    {
      label: `売上（${monthLong(first)}〜${monthLong(last)} 確定）`,
      value: yen(totals.revenue),
      sub: `${totals.months}ヶ月 ・ ADR ${money(totals.adr)}円 ・ ALOS ${num(totals.alos)}泊`,
      lead: true,
    },
    ...(booked
      ? [{
          label: `予約済み（${monthLong(booked.from)}〜${monthLong(booked.to)}）`,
          value: yen(booked.revenue),
          sub: `${booked.nights}泊 ・ 確定分と合わせて ${money(totals.revenue + booked.revenue)}円`,
          fresh: true,
        }]
      : []),
    {
      label: "営業損益（確定分の通算）",
      value: yen(totals.operatingProfit),
      sub: `限界利益 ${money(totals.contributionMargin)}円 − 固定費 ${money(totals.fixedCostTotal)}円`,
      neg: totals.operatingProfit < 0,
    },
    {
      label: "限界利益率（確定分の通算）",
      value: pct(totals.contributionMarginRate),
      sub: `変動費 ${money(totals.variableCostTotal)}円`,
    },
    {
      label: "平均稼働率（確定分）",
      value: pct(totals.occupancyRate),
      sub: `実泊数 ${totals.nightsActual}泊 ÷ 暦日数 ${totals.calendarDays}日`,
    },
  ];

  return (
    <>
      <div className="grid kpi">
        {cards.map((c) => (
          <section className={`card kpi-card${c.lead ? " lead" : ""}`} key={c.label}>
            <div className="label">{c.label}</div>
            <div className={`value ${c.neg ? "neg" : ""}`} style={c.fresh ? { color: "var(--series-1)" } : undefined}>
              {c.value}
            </div>
            <div className="sub">{c.sub}</div>
          </section>
        ))}
      </div>
      {booked && (
        <p className="desc" style={{ margin: "-2px 0 0" }}>
          確定分は収支表PDF由来、予約済みは Beds24 の予約データ由来です。出所も確からしさも違うので分けて出しています。
          予約済みは「いま入っている分」なので、これから積み上がります（内訳は「先行き（予約済み）」）。
        </p>
      )}
    </>
  );
}
