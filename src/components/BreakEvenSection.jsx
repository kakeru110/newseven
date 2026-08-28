import React, { useState } from "react";
import { Card } from "./ui.jsx";
import { money, pct, monthLong } from "../lib/format.js";
import { breakEvenPricePerNight, resolveRate, ratesFor } from "../lib/metrics.js";

/**
 * 損益分岐価格（CLAUDE.md §12-5）
 * P(N) = (清掃単価 ÷ N + 泊単価) ÷ (1 − OTA料率 − 運営サポート料率 × 消費税)
 * 料率は costRates から対象月で解決する（Booking.com は 2026-06 に 13.30% → 14.30%）。
 */
export default function BreakEvenSection({ seed, months }) {
  const monthOptions = months.map((m) => m.month);
  const [month, setMonth] = useState(monthOptions[monthOptions.length - 1]);
  const [nights, setNights] = useState(2);

  const r = ratesFor(seed, month);
  const otaRates = {
    airbnb: resolveRate(seed, "ota_rate_airbnb", month),
    booking: resolveRate(seed, "ota_rate_booking_base", month),
  };
  const priceFor = (channel, n) => breakEvenPricePerNight(seed, n, otaRates[channel], month);

  return (
    <Card
      title="損益分岐価格"
      note={`料率は ${monthLong(month)} 時点`}
      desc="この価格を下回る予約は、その1泊単体で見ると赤字。固定費は含めない（追加1泊を受けるかは限界利益で決まるため）。"
    >
      <div className="slider-row">
        <label htmlFor="be-nights">宿泊日数</label>
        <input
          id="be-nights" type="range" min="1" max="14" step="1"
          value={nights} onChange={(e) => setNights(Number(e.target.value))}
        />
        <span className="slider-val">{nights}泊</span>
        <label htmlFor="be-month" style={{ marginLeft: "auto" }}>適用月</label>
        <select id="be-month" className="ghost" value={month} onChange={(e) => setMonth(e.target.value)}
                style={{ font: "inherit", fontSize: 12, padding: "6px 10px", borderRadius: 8, background: "var(--surface)", color: "var(--text-1)", border: "1px solid var(--border)" }}>
          {monthOptions.map((m) => <option key={m} value={m}>{monthLong(m)}</option>)}
        </select>
      </div>

      <div className="pill-row">
        <div className="pill">
          <div className="k"><i style={{ background: "var(--series-1)" }} />Airbnb（{pct(otaRates.airbnb, 2)}）</div>
          <div className="v">{money(priceFor("airbnb", nights))} 円</div>
        </div>
        <div className="pill">
          <div className="k"><i style={{ background: "var(--series-2)" }} />Booking.com（{pct(otaRates.booking, 2)}）</div>
          <div className="v">{money(priceFor("booking", nights))} 円</div>
        </div>
        <div className="pill">
          <div className="k">Booking.com {nights}泊の合計下限（1予約あたり）</div>
          <div className="v">{money(priceFor("booking", nights) * nights)} 円</div>
        </div>
      </div>

      <div className="table-wrap" style={{ marginTop: 14 }}>
        <table>
          <thead>
            <tr>
              <th>泊数</th>
              <th>Airbnb</th>
              <th>Booking.com</th>
              <th className="col-total">seed 参照値（Airbnb / Booking）</th>
            </tr>
          </thead>
          <tbody>
            {seed.breakEvenPriceReference.map((ref) => (
              <tr key={ref.nights} className={ref.nights === nights ? "grand" : ""}>
                <td>{ref.nights}泊</td>
                <td>{money(priceFor("airbnb", ref.nights))} 円</td>
                <td>{money(priceFor("booking", ref.nights))} 円</td>
                <td className="col-total prov">{money(ref.airbnb)} / {money(ref.booking)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="footnotes">
        <li>
          単価: 清掃 {money(r.cleaningPerStay)}円/滞在 ・ 光熱 {money(r.utilitiesPerNight)}円/泊 ・ 日用品 {money(r.suppliesPerNight)}円/泊 ・
          運営サポート料 {pct(r.mgmtSupportRate, 0)}（税込 {pct(r.mgmtSupportRate * r.taxMultiplier, 0)}）。
        </li>
        <li>右端は seed.json の breakEvenPriceReference（2026年8月時点の想定）。左2列は選択中の月の料率で再計算した値。</li>
      </ul>
    </Card>
  );
}
