import React, { useMemo } from "react";
import { Card } from "./ui.jsx";
import { money, pct, num, monthLong } from "../lib/format.js";
import { priceRecommendations } from "../lib/pricing.js";

/**
 * 月別の値上げ推奨（CLAUDE.md §9-4）
 *
 * 稼働率で機械的に区分する。ただし立ち上げ期はレビュー獲得のために意図的に
 * 単価を下げていた期間なので、低単価を「安すぎる」と評価せず判断から外す。
 */
const BAND = {
  launch: { label: "立ち上げ期", tone: "var(--muted)" },
  hold: { label: "据え置き", tone: "var(--text-2)" },
  mid: { label: "中稼働", tone: "var(--series-1)" },
  high: { label: "高稼働", tone: "var(--series-2)" },
};

export default function PriceRecommendation({ seed, months }) {
  const recs = useMemo(() => priceRecommendations(seed, months), [seed, months]);
  const ctx = seed.pricingContext || {};
  const t = ctx.thresholds || {};
  const target = recs.filter((r) => r.increase > 0);
  const gainFlat = target.reduce((s, r) => s + r.gainIfFlat, 0);
  const gainHalf = target.reduce((s, r) => s + r.gainIfHalfDrop, 0);
  const perYear = (v) => (target.length ? (v * 12) / target.length : 0);

  return (
    <Card
      title="月別の値上げ推奨"
      note={`判定: 稼働 ${pct(t.highOccupancy ?? 0.88, 0)} 以上で +${Math.round((t.highIncrease ?? 0.15) * 100)}% ／ ${pct(t.midOccupancy ?? 0.7, 0)} 以上で +${Math.round((t.midIncrease ?? 0.1) * 100)}%`}
      desc="稼働率から機械的に判定します。売り切れに近い月ほど単価に余地があり、稼働の低い月は上げると空室が増えるだけなので触りません。"
    >
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>月</th>
              <th className="num">稼働率</th>
              <th className="num">1泊あたり売上</th>
              <th>区分</th>
              <th className="num">推奨</th>
              <th className="num">上げ後の目安</th>
              <th className="num">稼働の落ち幅の許容</th>
              <th className="num">営業損益の増分</th>
            </tr>
          </thead>
          <tbody>
            {recs.map((r) => {
              const band = BAND[r.band];
              return (
                <tr key={r.month} className={r.increase ? "" : "prov"}>
                  <td>
                    {monthLong(r.month)}
                    {r.isProvisional && <span className="psub"> 仮値</span>}
                  </td>
                  <td>{pct(r.occupancy)}</td>
                  <td>{money(r.perNight)}</td>
                  <td>
                    <span className="chip">
                      <span className="dot" style={{ background: band.tone }} />
                      {band.label}
                    </span>
                  </td>
                  <td>{r.increase ? `+${Math.round(r.increase * 100)}%` : "—"}</td>
                  <td>{r.increase ? `${money(r.suggestedPerNight)} 円` : "—"}</td>
                  <td>{r.tolerance != null ? `${num(r.tolerance * 100, 1)}pt（${pct(r.occupancy + r.tolerance, 0)} まで）` : "—"}</td>
                  <td>{r.gainIfFlat != null ? `+${money(r.gainIfFlat)} 円` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="pill-row" style={{ marginTop: 14 }}>
        <div className="pill">
          <div className="k">対象月</div>
          <div className="v">{target.length} ヶ月</div>
        </div>
        <div className="pill">
          <div className="k">稼働が半分落ちた場合（保守的）</div>
          <div className="v">+{money(gainHalf)} 円</div>
        </div>
        <div className="pill">
          <div className="k">稼働が変わらない場合</div>
          <div className="v">+{money(gainFlat)} 円</div>
        </div>
        <div className="pill">
          <div className="k">年換算の改善</div>
          <div className="v">+{money(perYear(gainHalf))} 〜 +{money(perYear(gainFlat))} 円</div>
        </div>
      </div>

      <ul className="footnotes">
        {ctx.note && <li>{ctx.note}</li>}
        <li>
          値上げの実務は PriceLabs のベース価格を月別に調整する操作です。CLAUDE.md §8 Stage 7 のとおり
          ベース価格は自動更新しません（PriceLabs が市場データで動かしている値に外から二重に介入しないため）。
        </li>
        <li>
          上げたあとは稼働率を追ってください。「稼働の落ち幅の許容」を超えて落ちたら戻す、という判断基準が数字で決まっています。
        </li>
        {recs.some((r) => r.isProvisional && r.increase > 0) && (
          <li>仮値の月を含む推奨は、収支表PDFで確定値に差し替えたあと再確認してください。</li>
        )}
      </ul>
    </Card>
  );
}
