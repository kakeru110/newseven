import React, { useMemo } from "react";
import { yen, pct, money, num, monthLong } from "../lib/format.js";
import { stayedVsUpcoming } from "../lib/forecast.js";
import { fiscalYear } from "../lib/regulation.js";

const pad = (n) => String(n).padStart(2, "0");
const nextMonth = (month) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

/**
 * サマリーカード（CLAUDE.md §12-1）
 *
 * 売上の合計は**今日までに泊まり終わった分だけ**を足す。
 *   確定     … 収支表PDFで検証済み（seed の最終月まで）
 *   泊まり終わった … 宿泊は済んだが収支表が届いていない（Beds24 の速報）
 * まだ泊まっていない予約（これから）は別カードにする。成立していない売上なので、
 * 実績と同じ数字に混ぜない。キャンセルされれば消える。
 *
 * 損益・率・稼働率は確定分だけで出す。変動費の一部（光熱・日用品）が
 * 単価マスタからの推計になるため、確定値と混ぜると精度の違いが見えなくなる。
 */
export default function SummaryCards({ totals, months, live }) {
  const first = months[0].month, last = months[months.length - 1].month;

  const ahead = useMemo(() => {
    if (!live || live.status !== "ok") return null;
    const asOf = new Date().toISOString().slice(0, 10);
    const from = `${nextMonth(last)}-01`;
    if (from > fiscalYear(asOf).end) return null;
    const split = stayedVsUpcoming(live.data.bookings, { from, asOf, to: fiscalYear(asOf).end });
    return split.total.nights ? { ...split, from, asOf } : null;
  }, [live, last]);

  /* 合計に足すのは、今日までに泊まり終わった分だけ */
  const realised = totals.revenue + (ahead ? ahead.stayed.revenue : 0);

  const cards = [
    {
      label: ahead ? "売上（本日までの実績）" : `売上（${monthLong(first)}〜${monthLong(last)} 通算）`,
      value: yen(realised),
      sub: ahead
        ? `確定 ${money(totals.revenue)}円（${monthLong(first)}〜${monthLong(last)}）＋ 収支表待ち ${money(ahead.stayed.revenue)}円（${ahead.stayed.nights}泊）`
        : `${totals.months}ヶ月 ・ ADR ${money(totals.adr)}円 ・ ALOS ${num(totals.alos)}泊`,
      lead: true,
    },
    ...(ahead
      ? [{
          label: "これから泊まる予約（未成立）",
          value: yen(ahead.upcoming.revenue),
          sub: `${ahead.upcoming.nights}泊 ・ ${monthLong(ahead.from)}〜年度末 ・ 上の合計には入れていません`,
          fresh: true,
        }]
      : []),
    {
      label: `営業損益（${monthLong(first)}〜${monthLong(last)} 確定）`,
      value: yen(totals.operatingProfit),
      sub: `限界利益 ${money(totals.contributionMargin)}円 − 固定費 ${money(totals.fixedCostTotal)}円`,
      neg: totals.operatingProfit < 0,
    },
    {
      label: "限界利益率（確定分）",
      value: pct(totals.contributionMarginRate),
      sub: `変動費 ${money(totals.variableCostTotal)}円 ・ ADR ${money(totals.adr)}円`,
    },
    {
      label: "平均稼働率（確定分）",
      value: pct(totals.occupancyRate),
      sub: `実泊数 ${totals.nightsActual}泊 ÷ 暦日数 ${totals.calendarDays}日 ・ ALOS ${num(totals.alos)}泊`,
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
      {ahead && (
        <p className="desc" style={{ margin: "-2px 0 0" }}>
          売上の合計は<b>今日までに泊まり終わった分だけ</b>です。「確定」は収支表PDFで検証済みの金額、
          「収支表待ち」は宿泊は済んだが収支表がまだ届いていない分（Beds24 の実額）。
          これから泊まる予約はキャンセルで消えるため、実績と同じ数字には混ぜていません。
          損益・率・稼働率は確定分だけで出しています（変動費の一部が推計になるため）。
          月別の内訳は「先行き（予約済み）」を見てください。
        </p>
      )}
    </>
  );
}
