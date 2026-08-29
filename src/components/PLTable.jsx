import React from "react";
import { Card } from "./ui.jsx";
import { money, pct, num, monthLong, signClass } from "../lib/format.js";

/**
 * 月次P/L（CLAUDE.md §12-3）
 * 売上 → 変動費内訳 → 限界利益 → 固定費内訳 → 営業損益 の順。
 * 派生値（稼働率・ADR・ALOS・限界利益率・損益分岐）は seed の生値から計算した値を表示する。
 */
export default function PLTable({ months, totals, incidents, notes }) {
  const sumOf = (get) => months.reduce((s, m) => s + (get(m) || 0), 0);

  const money2 = (v) => <span className={signClass(v)}>{money(v)}</span>;

  const rows = [
    { section: "売上" },
    { label: "Airbnb", get: (m) => m.revenue.airbnb, indent: true },
    { label: "Booking.com", get: (m) => m.revenue.booking, indent: true },
    { label: "直販", get: (m) => m.revenue.direct, indent: true },
    { label: "内訳不明", get: (m) => m.revenue.unattributed, indent: true },
    { label: "売上 合計", get: (m) => m.revenueTotal, cls: "total" },

    { section: "変動費" },
    { label: "清掃・ごみ（税込）", get: (m) => m.variableCosts.cleaningTotalInclTax, indent: true, mark: (m) => m.variableCosts.advanceCredit !== 0 },
    { label: "OTA手数料", get: (m) => m.variableCosts.otaFee, indent: true },
    { label: "運営サポート料（税込）", get: (m) => m.variableCosts.mgmtSupportFeeInclTax, indent: true },
    { label: "光熱費", get: (m) => m.variableCosts.utilities, indent: true },
    { label: "日用品", get: (m) => m.variableCosts.supplies, indent: true },
    { label: "変動費 合計", get: (m) => m.variableCostTotal, cls: "total" },

    { label: "限界利益", get: (m) => m.contributionMargin, cls: "grand" },
    { label: "限界利益率", get: (m) => m.contributionMarginRate, fmt: (v) => pct(v), total: totals.contributionMarginRate },

    { section: "固定費" },
    { label: "家賃", get: (m) => m.fixedCosts.rent, indent: true },
    { label: "インターネット", get: (m) => m.fixedCosts.internet, indent: true },
    { label: "Beds24", get: (m) => m.fixedCosts.beds24, indent: true },
    { label: "PriceLabs", get: (m) => m.fixedCosts.pricelabs, indent: true },
    { label: "運営委託費（税込）", get: (m) => m.fixedCosts.mgmtBaseFeeInclTax, indent: true },
    { label: "チェックインシステム", get: (m) => m.fixedCosts.checkinSystemInclTax, indent: true },
    { label: "騒音センサー", get: (m) => m.fixedCosts.noiseSensorInclTax, indent: true },
    { label: "固定費 合計", get: (m) => m.fixedCostTotal, cls: "total" },

    { label: "営業損益", get: (m) => m.operatingProfit, cls: "grand" },

    { section: "参考指標（seed の生値から計算）" },
    { label: "実泊数", get: (m) => m.nightsActual, fmt: (v) => `${v}泊`, total: totals.nightsActual, totalFmt: `${totals.nightsActual}泊` },
    { label: "売上計上泊数", get: (m) => m.nightsRevenue, fmt: (v) => `${v}泊`, total: totals.nightsRevenue, totalFmt: `${totals.nightsRevenue}泊` },
    { label: "暦日数", get: (m) => m.calendarDays, fmt: (v) => `${v}日`, total: totals.calendarDays, totalFmt: `${totals.calendarDays}日` },
    { label: "清掃回数", get: (m) => m.cleaningCount, fmt: (v) => `${v}回`, total: totals.cleaningCount, totalFmt: `${totals.cleaningCount}回` },
    { label: "稼働率", get: (m) => m.occupancyRate, fmt: (v) => pct(v), total: totals.occupancyRate },
    { label: "ADR", get: (m) => m.adr, fmt: (v) => money(v), total: totals.adr },
    { label: "平均宿泊日数（ALOS）", get: (m) => m.alos, fmt: (v) => `${num(v)}泊`, total: totals.alos, totalFmt: `${num(totals.alos)}泊` },
    { label: "損益分岐売上", get: (m) => m.breakEvenRevenue, fmt: (v) => (v == null ? "—" : money(v)) },
    { label: "損益分岐稼働率", get: (m) => m.breakEvenOccupancy, fmt: (v) => (v == null ? "—" : pct(v)) },
  ];

  const totalCell = (row) => {
    if (row.totalFmt) return row.totalFmt;
    if (row.total != null) return row.fmt ? row.fmt(row.total) : money2(row.total);
    if (row.label === "損益分岐売上" || row.label === "損益分岐稼働率") return "—";
    const v = sumOf(row.get);
    return row.fmt ? row.fmt(v) : money2(v);
  };

  return (
    <Card title="月次P/L" note="単位: 円（税込）／通算列は各月の合計" desc="売上 → 変動費 → 限界利益 → 固定費 → 営業損益。マイナスは括弧つきの赤字。">
      <div className="table-wrap">
        <table className="sticky-first">
          <thead>
            <tr>
              <th>項目</th>
              {months.map((m) => (
                <th key={m.month} className={m.isProvisional ? "prov" : ""}>{monthLong(m.month)}</th>
              ))}
              <th className="col-total">通算</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) =>
              row.section ? (
                <tr className="section" key={`s${i}`}>
                  <td colSpan={months.length + 2}>{row.section}</td>
                </tr>
              ) : (
                <tr className={row.cls || ""} key={row.label}>
                  <td className={row.indent ? "indent" : ""}>{row.label}</td>
                  {months.map((m) => {
                    const v = row.get(m);
                    return (
                      <td key={m.month} className={row.mark && row.mark(m) ? "prov-mark" : ""}>
                        {row.fmt ? row.fmt(v) : money2(v)}
                      </td>
                    );
                  })}
                  <td className="col-total">{totalCell(row)}</td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
      <ul className="footnotes">
        {/* 欠損・仮値の注記は seed.notes.missingData から出す（原資料が届いたら seed の更新だけで消える） */}
        {(notes?.missingData || []).map((note) => (
          <li key={note}>{note}</li>
        ))}
        {incidents.map((inc) => (
          <li key={inc.date}>
            {monthLong(inc.date)} ※ 清掃・ごみに立替控除 {money(inc.compensationAmount)}円 を含む（{inc.description} 評価{inc.guestRating}／実損{money(inc.netLoss)}円）。
          </li>
        ))}
        <li>損益分岐売上・損益分岐稼働率は月ごとの固定費と限界利益率から算出するため、通算列は算定しない。</li>
      </ul>
    </Card>
  );
}
