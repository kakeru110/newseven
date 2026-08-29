import React, { useMemo, useState } from "react";
import { Card } from "./ui.jsx";
import { yen, money, pct, num } from "../lib/format.js";
import { baseline, simulate, breakEvenOccupancyDelta } from "../lib/pricing.js";

/**
 * 値上げシミュレーター（CLAUDE.md §9-1 / §9-4）
 *
 * 損益分岐価格は「その1泊を受けるか」の下限で、実績では122件中2件しか割っていない。
 * 効くのは下限ではなく上振れ余地なので、「単価を上げて稼働が落ちても利益は増えるか」を見る。
 */

const PRICE_STEPS = [-0.1, 0, 0.1, 0.2, 0.3];
const OCC_STEPS = [0.45, 0.55, 0.65, 0.75, 0.85, 0.95];

/** 営業損益に応じた背景色。プラスは青、マイナスは赤、ゼロ近傍は面の色（中立） */
function cellColor(value, scale) {
  const t = Math.max(-1, Math.min(1, value / scale));
  const alpha = Math.abs(t) * 0.8;
  return t >= 0 ? `rgba(42, 120, 214, ${alpha})` : `rgba(208, 59, 59, ${alpha})`;
}

export default function PricingSimulator({ seed, totals, month }) {
  const base = useMemo(() => baseline(seed, totals), [seed, totals]);
  const [pricePct, setPricePct] = useState(10);
  const [occDelta, setOccDelta] = useState(0);

  const result = simulate(seed, base, {
    priceMultiplier: 1 + pricePct / 100,
    occupancyDelta: occDelta / 100,
    month,
  });

  const tolerance = PRICE_STEPS.filter((p) => p > 0).map((p) => ({
    pct: p,
    delta: breakEvenOccupancyDelta(seed, base, 1 + p, month),
    gain: simulate(seed, base, { priceMultiplier: 1 + p, occupancyDelta: 0, month }).deltaOperatingProfit,
  }));

  const grid = OCC_STEPS.map((occ) =>
    PRICE_STEPS.map((p) =>
      simulate(seed, base, { priceMultiplier: 1 + p, occupancyDelta: occ - base.occupancy, month })
    )
  );
  const scale = Math.max(...grid.flat().map((c) => Math.abs(c.operatingProfit)), 1);
  const nearestOcc = OCC_STEPS.reduce((a, b) => (Math.abs(b - base.occupancy) < Math.abs(a - base.occupancy) ? b : a));

  return (
    <Card
      title="値上げシミュレーター"
      note={`基準: 実績の月平均（稼働 ${pct(base.occupancy)} ・ 1泊あたり ${money(base.perNight)}円）`}
      desc="単価を上げると稼働は落ちます。落ちてもなお利益が増えるのかを見るための計算です。清掃費が1滞在固定なので、泊数が減るとコストも減る点が効きます。"
    >
      <div className="slider-row">
        <label htmlFor="sim-price">単価</label>
        <input id="sim-price" type="range" min="-20" max="40" step="1" value={pricePct}
               onChange={(e) => setPricePct(Number(e.target.value))} />
        <span className="slider-val">{pricePct > 0 ? "+" : ""}{pricePct}%</span>
      </div>
      <div className="slider-row">
        <label htmlFor="sim-occ">稼働率</label>
        <input id="sim-occ" type="range" min="-30" max="15" step="1" value={occDelta}
               onChange={(e) => setOccDelta(Number(e.target.value))} />
        <span className="slider-val">{occDelta > 0 ? "+" : ""}{occDelta}pt</span>
      </div>

      <div className="pill-row">
        <div className="pill">
          <div className="k">1泊あたり売上</div>
          <div className="v">{money(result.perNight)} 円</div>
        </div>
        <div className="pill">
          <div className="k">稼働率 / 泊数</div>
          <div className="v">{pct(result.occupancy, 0)} <span style={{ fontSize: 13, color: "var(--text-2)" }}>{num(result.nights, 1)}泊</span></div>
        </div>
        <div className="pill">
          <div className="k">売上（月）</div>
          <div className="v">{money(result.revenue)} 円</div>
        </div>
        <div className="pill" style={{ borderColor: result.deltaOperatingProfit >= 0 ? "var(--series-1)" : "var(--neg)" }}>
          <div className="k">営業損益（月）</div>
          <div className="v">
            {money(result.operatingProfit)} 円{" "}
            <span style={{ fontSize: 13, color: result.deltaOperatingProfit >= 0 ? "var(--up)" : "var(--neg)" }}>
              {result.deltaOperatingProfit >= 0 ? "+" : ""}{money(result.deltaOperatingProfit)}
            </span>
          </div>
        </div>
      </div>

      <h3 style={{ fontSize: 12.5, fontWeight: 600, margin: "18px 0 6px" }}>値上げしても利益を維持できる稼働の落ち幅</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>単価</th>
              <th className="num">稼働がここまで落ちても利益は減らない</th>
              <th className="num">稼働が変わらない場合の営業損益の増分</th>
            </tr>
          </thead>
          <tbody>
            {tolerance.map((t) => (
              <tr key={t.pct} className={Math.round(t.pct * 100) === pricePct ? "grand" : ""}>
                <td>+{Math.round(t.pct * 100)}%</td>
                <td>{num(t.delta * 100, 1)}pt（{pct(base.occupancy + t.delta, 1)} まで）</td>
                <td>+{money(t.gain)} 円/月</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 style={{ fontSize: 12.5, fontWeight: 600, margin: "18px 0 6px" }}>単価 × 稼働率 の営業損益（月・円）</h3>
      <div className="table-wrap">
        <table style={{ minWidth: 520 }}>
          <thead>
            <tr>
              <th>稼働率＼単価</th>
              {PRICE_STEPS.map((p) => (
                <th key={p} className="num">{p > 0 ? "+" : ""}{Math.round(p * 100)}%</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {OCC_STEPS.map((occ, i) => (
              <tr key={occ}>
                <td>{pct(occ, 0)}{occ === nearestOcc ? " ←現在" : ""}</td>
                {grid[i].map((cell, j) => (
                  <td key={j} style={{ background: cellColor(cell.operatingProfit, scale), fontVariantNumeric: "tabular-nums" }}>
                    {money(cell.operatingProfit)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="footnotes">
        <li>
          直接競合との単価差は 8,490円/泊（自施設 22,711円 vs 競合 31,201円）で、率にすると約27%。
          上表の +20〜30% は競合水準に並べにいく場合にあたります。
        </li>
        <li>
          損益分岐価格を割った予約は実績122件中2件（2026年2月・不足4,553円）だけで、下限はすでに守れています。
          伸びしろは下限ではなく上振れ側にあります。
        </li>
        <li>
          モデルは実績を基準点とし、そこからの差分だけを単価マスタで計算しています（基準点では実績と完全に一致）。
          平均宿泊日数は {num(base.alos)}泊で据え置き、値上げによる滞在日数の変化は織り込んでいません。
        </li>
      </ul>
    </Card>
  );
}
