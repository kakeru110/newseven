/**
 * Stage 1 完了条件の検証（CLAUDE.md §12「完了条件」）
 *   node scripts/verify.mjs   /   npm run verify
 *
 * seed.json から計算した値が、CLAUDE.md に記載された表と一致するかを確かめる。
 * 一致しない場合は計算式の実装ミス（seed の値は正しい）。
 */
import { readFile } from "node:fs/promises";
import {
  allMonths, periodTotals, breakEvenPricePerNight, resolveRate, channelSummary,
} from "../src/lib/metrics.js";

const seed = JSON.parse(await readFile(new URL("../data/seed.json", import.meta.url), "utf8"));

/* CLAUDE.md §12 完了条件の表（この値は CLAUDE.md からの転記であり、計算には使わない） */
const EXPECTED_MONTHLY = [
  { month: "2026-02", revenue: 234575, cmRate: 26.6, operatingProfit: -123449 },
  { month: "2026-03", revenue: 635603, cmRate: 35.3, operatingProfit: 38303 },
  { month: "2026-04", revenue: 587734, cmRate: 44.4, operatingProfit: 73572 },
  { month: "2026-05", revenue: 602657, cmRate: 50.6, operatingProfit: 115257 },
  { month: "2026-06", revenue: 475603, cmRate: 46.5, operatingProfit: 31273 },
  { month: "2026-07", revenue: 530932, cmRate: 42.7, operatingProfit: 36807 },
  { month: "2026-08", revenue: 834209, cmRate: 46.8, operatingProfit: 200441 },
];
const EXPECTED_TOTAL = { revenue: 3901313, operatingProfit: 372204, cmRate: 43.3, occupancy: 77.4 };

let failed = 0;
const check = (label, actual, expected, tolerance = 0) => {
  const ok = Math.abs(actual - expected) <= tolerance;
  if (!ok) failed++;
  const fmt = (v) => (Number.isInteger(v) ? v.toLocaleString("ja-JP") : v.toFixed(1));
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label.padEnd(34)} 計算値 ${fmt(actual)}${ok ? "" : `　期待値 ${fmt(expected)}`}`);
};

console.log("■ 月次（売上 / 限界利益率 / 営業損益）");
const months = allMonths(seed);
for (const exp of EXPECTED_MONTHLY) {
  const m = months.find((x) => x.month === exp.month);
  if (!m) { console.log(`  FAIL  ${exp.month} が seed に存在しない`); failed++; continue; }
  check(`${exp.month} 売上`, Math.round(m.revenueTotal), exp.revenue);
  check(`${exp.month} 限界利益率(%)`, +(m.contributionMarginRate * 100).toFixed(1), exp.cmRate, 0.05);
  check(`${exp.month} 営業損益`, Math.round(m.operatingProfit), exp.operatingProfit);
}

console.log("\n■ 期間通算");
const t = periodTotals(seed);
check("通算 売上", Math.round(t.revenue), EXPECTED_TOTAL.revenue);
check("通算 営業損益", Math.round(t.operatingProfit), EXPECTED_TOTAL.operatingProfit);
check("通算 限界利益率(%)", +(t.contributionMarginRate * 100).toFixed(1), EXPECTED_TOTAL.cmRate, 0.05);
check("平均稼働率(%)", +(t.occupancyRate * 100).toFixed(1), EXPECTED_TOTAL.occupancy, 0.05);

console.log("\n■ 損益分岐価格 P(N)（seed の breakEvenPriceReference と突合）");
const refMonth = "2026-08";   // Booking 14.30% が適用される月
for (const ref of seed.breakEvenPriceReference) {
  const airbnb = breakEvenPricePerNight(seed, ref.nights, resolveRate(seed, "ota_rate_airbnb", refMonth), refMonth);
  const booking = breakEvenPricePerNight(seed, ref.nights, resolveRate(seed, "ota_rate_booking_base", refMonth), refMonth);
  check(`${ref.nights}泊 Airbnb`, Math.round(airbnb), ref.airbnb, 1);
  check(`${ref.nights}泊 Booking.com`, Math.round(booking), ref.booking, 1);
}

console.log("\n■ 料率の日付解決（Booking.com は 2026-06 に 13.30% → 14.30%）");
check("2026-05 の Booking 料率(%)", resolveRate(seed, "ota_rate_booking_base", "2026-05") * 100, 13.3, 0.001);
check("2026-06 の Booking 料率(%)", resolveRate(seed, "ota_rate_booking_base", "2026-06") * 100, 14.3, 0.001);
check("2026-04 の宣伝プログラム料率(%)", resolveRate(seed, "ota_rate_booking_promo", "2026-04") * 100, 16.97, 0.001);
const promoJune = resolveRate(seed, "ota_rate_booking_promo", "2026-06");
check("2026-06 の宣伝プログラム料率（適用なし）", promoJune === null ? 1 : 0, 1);

console.log("\n■ 2026-03 収支表PDFとの突合（合計欄の実額）");
const march = months.find((m) => m.month === "2026-03");
const marchCh = ["airbnb", "booking"].map((k) => seed.channelMonthly[k]["2026-03"]);
check("売上（PDF合計欄）", Math.round(march.revenueTotal), 635603);
check("チャネル内訳の合計が売上と一致", marchCh.reduce((s, c) => s + c.revenue, 0), 635603);
check("OTA手数料（PDF合計欄）", march.variableCosts.otaFee, 100316);
check("チャネル別OTA手数料の合計が一致", marchCh.reduce((s, c) => s + c.otaFee, 0), 100316);
check("宿泊日数（PDF合計欄）", marchCh.reduce((s, c) => s + c.nights, 0), 28);
check("予約件数（PDF合計欄）", marchCh.reduce((s, c) => s + c.bookings, 0), 25);
/* CLAUDE.md §6-1: 運営サポート料金は売上のちょうど10%（税抜）。PDFの63,560円と突合する */
check("運営サポート料（税込）= 63,560 × 1.1", march.variableCosts.mgmtSupportFeeInclTax, Math.round(63560 * 1.1));
check("Airbnb 実料率(%)", +((marchCh[0].otaFee / marchCh[0].revenue) * 100).toFixed(2), 15.5, 0.02);
/* 宣伝プログラム（16.97%）は実績では3月から適用されていた */
check("2026-03 の宣伝プログラム料率(%)", resolveRate(seed, "ota_rate_booking_promo", "2026-03") * 100, 16.97, 0.001);
const promoFeb = resolveRate(seed, "ota_rate_booking_promo", "2026-02");
check("2026-02 は宣伝プログラム適用なし", promoFeb === null ? 1 : 0, 1);

console.log("\n■ 2026-08 清掃請求書との突合（2026-09-01付 ラフプラス請求書）");
const aug = seed.monthly.find((m) => m.month === "2026-08");
const augBags = seed.garbageTrend.find((g) => g.month === "2026-08");
/* 明細は清掃22回 + 7/30 の待機費1時間（1,500円）。ごみは42袋 */
check("清掃請負費（税抜・待機費を含む）", aug.variableCosts.cleaningBaseExclTax, 22 * 6500 + 1500);
check("ごみ回収費（税抜）", aug.variableCosts.garbageExclTax, 42 * 800);
check("請求書の合計欄（税込）", aug.variableCosts.cleaningTotalInclTax, 195910);
check("清掃回数", aug.cleaningCount, 22);
check("ごみ袋数", augBags.bags, 42);

console.log("\n■ 清掃請求の内部整合（全月：合計 =（清掃 + ごみ）× 1.1 + 立替控除）");
for (const m of seed.monthly) {
  const v = m.variableCosts;
  const taxMul = resolveRate(seed, "consumption_tax_multiplier", m.month);
  const bagRate = resolveRate(seed, "garbage_per_bag_excl_tax", m.month);
  const trend = seed.garbageTrend.find((g) => g.month === m.month);
  check(`${m.month} 合計（税込）`, v.cleaningTotalInclTax,
    Math.round((v.cleaningBaseExclTax + v.garbageExclTax) * taxMul) + v.advanceCredit);
  check(`${m.month} ごみ袋数 × ${bagRate}円`, v.garbageExclTax, trend.bags * bagRate);
}

console.log("\n■ チャネル別（内訳の無い 2026-08 は除外されること）");
const ch = channelSummary(seed);
check("対象月数", ch[0].months.length, 6);
check("2026-03 を含む（PDF入手により内訳が判明）", ch[0].months.includes("2026-03") ? 1 : 0, 1);
check("除外月に 2026-08 を含まない", ch[0].months.includes("2026-08") ? 0 : 1, 1);
const airbnbCh = ch.find((c) => c.key === "airbnb");
/* CLAUDE.md §9-1: 7月のAirbnbは ALOS 1.75 */
const july = seed.channelMonthly.airbnb["2026-07"];
check("2026-07 Airbnb ALOS", +(july.nights / july.bookings).toFixed(2), 1.75, 0.005);
check("Airbnb 実料率(%)", +(airbnbCh.otaRate * 100).toFixed(2), 15.5, 0.02);

console.log(failed === 0 ? "\n✅ すべて一致しました（Stage 1 完了条件を満たしています）" : `\n❌ ${failed} 件が不一致です`);
process.exit(failed === 0 ? 0 : 1);
