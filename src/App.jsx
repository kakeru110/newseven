import React, { useMemo } from "react";
import seed from "../data/seed.json";
import {
  allMonths, periodTotals, channelSummary, channelMonthlyRows, garbageTrend,
} from "./lib/metrics.js";
import { monthLong } from "./lib/format.js";
import SummaryCards from "./components/SummaryCards.jsx";
import MonthlyTrendChart from "./components/MonthlyTrendChart.jsx";
import PLTable from "./components/PLTable.jsx";
import ChannelSection from "./components/ChannelSection.jsx";
import BreakEvenSection from "./components/BreakEvenSection.jsx";
import GarbageTrendChart from "./components/GarbageTrendChart.jsx";
import LiveSection from "./components/LiveSection.jsx";
import AcquisitionSection from "./components/AcquisitionSection.jsx";
import PricingSimulator from "./components/PricingSimulator.jsx";
import PriceRecommendation from "./components/PriceRecommendation.jsx";

/**
 * Stage 1（CLAUDE.md §8 / §12）
 * data/seed.json だけを入力とする静的ダッシュボード。API 接続なし。
 */
export default function App() {
  const months = useMemo(() => allMonths(seed), []);
  const totals = useMemo(() => periodTotals(seed), []);
  const channels = useMemo(() => channelSummary(seed), []);
  const chMonthly = useMemo(() => channelMonthlyRows(seed), []);
  const garbage = useMemo(() => garbageTrend(seed), []);

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>{seed.property.name} 分析ダッシュボード</h1>
          <div className="sub">
            {seed.property.location} ・ {seed.property.rooms}部屋 ・ 運営 {seed.property.operator}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span className="badge stage"><span className="dot" />Stage 1 ・ 静的データ（API接続なし）</span>
          {totals.hasProvisional && (
            <span className="badge">
              <span className="dot" />
              {totals.provisionalMonths.map(monthLong).join("・")}は仮値
            </span>
          )}
        </div>
      </header>

      <SummaryCards totals={totals} months={months} />
      <LiveSection seed={seed} />
      <MonthlyTrendChart months={months} />
      <PLTable months={months} totals={totals} incidents={seed.incidents} notes={seed.notes} />
      <ChannelSection channels={channels} monthlyRows={chMonthly} allMonths={months.map((m) => m.month)} />
      <AcquisitionSection seed={seed} channels={channels} />
      <PriceRecommendation seed={seed} months={months} />
      <PricingSimulator seed={seed} totals={totals} month={months[months.length - 1].month} />
      <div className="grid c2">
        <BreakEvenSection seed={seed} months={months} />
        <GarbageTrendChart trend={garbage} />
      </div>

      <footer className="page-foot">
        入力は <code>data/seed.json</code>（{seed.generatedAt} 時点）のみ。すべての派生値は seed の生値から計算しています。
        完了条件の突合は <code>npm run verify</code> で実行できます。
      </footer>
    </div>
  );
}
