/**
 * 先行き（オン・ザ・ブックス）とペース判定の検証
 *   npm run verify:forecast
 *
 * data/fixtures/beds24-bookings.json（2026-09-04 取得）を基準日 2026-09-04 で読む。
 */
import { readFile } from "node:fs/promises";
import { monthlyForecast, onTheBooks, paceBenchmark, bookedAsOf, latestFixedCost, daysInMonth } from "../src/lib/forecast.js";
import { consumption, fiscalYear } from "../src/lib/regulation.js";

const load = async (p) => JSON.parse(await readFile(new URL(p, import.meta.url), "utf8"));
const seed = await load("../data/seed.json");
const fixture = await load("../data/fixtures/beds24-bookings.json");
const TODAY = "2026-09-04";

let failed = 0;
const check = (label, actual, expected, tolerance = 0, detail = "") => {
  const ok = typeof expected === "boolean" || typeof expected === "string"
    ? actual === expected
    : Math.abs(actual - expected) <= tolerance;
  if (!ok) failed++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label.padEnd(40)} ${detail || (ok ? actual : `${actual} / 期待 ${expected}`)}`);
};

/* 規制の残り枠を月別に配る。今は残り0なので、どの月も新規は受けられない */
const fy = fiscalYear(TODAY);
const c = consumption(fixture.bookings, { today: TODAY, fy });
const quota = Object.fromEntries(["2026-09", "2026-10", "2026-11", "2026-12", "2027-01"].map((m) => [m, c.remaining]));

const MONTHS = ["2026-09", "2026-10", "2026-11", "2026-12", "2027-01"];
const rows = monthlyForecast(seed, fixture.bookings, { months: MONTHS, asOf: TODAY, assumedAlos: 1.36, quotaByMonth: quota });

console.log("■ 月別の予約済み損益（2026-09-04 時点）");
console.log("  月        泊  稼働   売上      限界利益   営業損益   分岐まで  規制枠");
for (const r of rows) {
  console.log(
    `  ${r.month} ${String(r.nights).padStart(3)} ${(r.occupancy * 100).toFixed(1).padStart(5)}% ` +
      `${Math.round(r.revenue).toLocaleString("ja-JP").padStart(9)} ${Math.round(r.contributionMargin).toLocaleString("ja-JP").padStart(9)} ` +
      `${Math.round(r.operatingProfit).toLocaleString("ja-JP").padStart(10)} ${r.nightsToBreakEven.toFixed(1).padStart(7)}泊 ` +
      `${String(r.sellableDays).padStart(5)}日`
  );
}

console.log("\n■ 配分と突合");
/* 宿泊日ベースの配分なので、月をまたぐ滞在は分割される。合計は全期間で保存されること */
const live = bookedAsOf(fixture.bookings, null);
const totalNights = live.reduce((s, b) => s + Math.round((new Date(b.departure) - new Date(b.arrival)) / 86400000), 0);
const allMonths = [];
for (let y = 2026, m = 1; !(y === 2027 && m > 3); m === 12 ? ((y += 1), (m = 1)) : (m += 1)) {
  allMonths.push(`${y}-${String(m).padStart(2, "0")}`);
}
const spread = allMonths.reduce((s, m) => s + onTheBooks(fixture.bookings, m, null).nights, 0);
check("全期間の泊数が配分で保存される", spread, totalNights);
const spreadRev = allMonths.reduce((s, m) => s + onTheBooks(fixture.bookings, m, null).revenue, 0);
const totalRev = live.reduce((s, b) => s + (b.price || 0), 0);
check("全期間の売上が配分で保存される", Math.round(spreadRev), Math.round(totalRev), 1);

/* 8月は seed（収支表・Beds24 実額）と一致するはず */
const aug = onTheBooks(fixture.bookings, "2026-08", null);
const seedAug = seed.monthly.find((m) => m.month === "2026-08");
check("2026-08 の売上が seed と一致", Math.round(aug.revenue), seedAug.revenue.total, 1);
check("2026-08 のOTA手数料が seed と一致", Math.round(aug.commission), seedAug.variableCosts.otaFee, 1);
check("2026-08 の泊数が seed と一致", aug.nights, seedAug.nightsActual);

console.log("\n■ 過去の再現（asOf を遡ると泊数は単調に減る）");
/* 予約が入った件数は単調に増える。一方 OTB の泊数はキャンセルで減ることがある */
for (const m of ["2026-08", "2026-09"]) {
  const series = ["2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01", TODAY].map((d) => onTheBooks(fixture.bookings, m, d).nights);
  console.log(`  ${m} の積み上がり  ${series.join(" → ")}　（途中の減少はキャンセル）`);
}
const counts = ["2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01", TODAY].map((d) => bookedAsOf(fixture.bookings, d).length);
check("予約された件数は単調に増える", counts.every((v, i) => i === 0 || v >= counts[i - 1]), true, 0, counts.join(" → "));
/* キャンセルされた予約も、生きていた時点では在庫を埋めていた */
const withCancelled = bookedAsOf(fixture.bookings, "2026-06-01").filter((b) => String(b.status).toLowerCase() === "cancelled");
check("当時まだ生きていたキャンセル予約を含む", withCancelled.length > 0, true, 0, `${withCancelled.length}件`);

console.log("\n■ ペース判定（同じリードタイムの過去月と比べる）");
const history = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];
for (const m of ["2026-10", "2026-11", "2026-12"]) {
  const p = paceBenchmark(fixture.bookings, { month: m, asOf: TODAY, history });
  console.log(
    `  ${m} リード${String(p.leadDays).padStart(3)}日  現在 ${String(p.nights).padStart(2)}泊  ` +
      `過去の同時期 ${p.benchmark.min}〜${p.benchmark.max}泊（中央 ${p.benchmark.median}）  ` +
      `着地 ${p.landing.low}〜${p.landing.high}泊（中央 ${p.landing.mid}）  判定 ${p.verdict}`
  );
  check(`${m} の比較対象が対象月より前だけ`, p.samples.every((s) => s.month < m), true, 0, `${p.samples.length}ヶ月`);
  check(`${m} の着地見込みが暦日を超えない`, p.landing.high <= daysInMonth(m), true);
  check(`${m} の着地見込みは現在の泊数を下回らない`, p.landing.low >= p.nights, true);
}

console.log("\n■ 規制枠との整合");
check("残り枠", c.remaining, 0);
check("どの月も新規は受けられない", rows.every((r) => r.sellableDays === 0), true);
check("暦の空きは残っている（＝枠が制約になっている）", rows.every((r) => r.openDays > 0 && r.quotaLimited), true);
check("固定費（seed 最終月）", latestFixedCost(seed), 189669);

console.log(failed === 0 ? "\n✅ すべて期待どおりです" : `\n❌ ${failed} 件が不一致です`);
process.exit(failed === 0 ? 0 : 1);
