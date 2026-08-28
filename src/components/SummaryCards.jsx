import React from "react";
import { yen, pct, money, num, monthLong } from "../lib/format.js";
import { signClass } from "../lib/format.js";

/** サマリーカード（CLAUDE.md §12-1）: 期間通算の売上・営業損益・限界利益率・平均稼働率 */
export default function SummaryCards({ totals, months }) {
  const first = months[0].month, last = months[months.length - 1].month;
  const cards = [
    {
      label: `売上（${monthLong(first)}〜${monthLong(last)} 通算）`,
      value: yen(totals.revenue),
      sub: `${totals.months}ヶ月 ・ ADR ${money(totals.adr)}円 ・ ALOS ${num(totals.alos)}泊`,
      lead: true,
    },
    {
      label: "営業損益（通算）",
      value: yen(totals.operatingProfit),
      sub: `限界利益 ${money(totals.contributionMargin)}円 − 固定費 ${money(totals.fixedCostTotal)}円`,
      neg: totals.operatingProfit < 0,
    },
    {
      label: "限界利益率（通算）",
      value: pct(totals.contributionMarginRate),
      sub: `変動費 ${money(totals.variableCostTotal)}円`,
    },
    {
      label: "平均稼働率",
      value: pct(totals.occupancyRate),
      sub: `実泊数 ${totals.nightsActual}泊 ÷ 暦日数 ${totals.calendarDays}日`,
    },
  ];

  return (
    <div className="grid kpi">
      {cards.map((c) => (
        <section className={`card kpi-card${c.lead ? " lead" : ""}`} key={c.label}>
          <div className="label">{c.label}</div>
          <div className={`value ${c.neg ? "neg" : ""}`}>{c.value}</div>
          <div className="sub">{c.sub}</div>
        </section>
      ))}
    </div>
  );
}
