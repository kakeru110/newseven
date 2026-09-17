/**
 * Search Console 集計の検証
 *   npm run verify:searchconsole
 *
 * API が未接続でも壊れないよう、決定的な合成データで純関数を検算する。
 * 実データが来たら data/fixtures/searchconsole-daily.json を置けば
 * そちらを読む（無ければ合成データ）。
 */
import { readFile } from "node:fs/promises";
import {
  rollup, slice, monthly, coverage, relaunchComparison, funnel, bottleneck, addDays,
  directBookingsBookedBetween, weekly,
} from "../src/lib/searchconsole.js";

const load = async (p) => JSON.parse(await readFile(new URL(p, import.meta.url), "utf8"));
const seed = await load("../data/seed.json");

let failed = 0;
const check = (label, actual, expected, tolerance = 0) => {
  const ok = typeof expected === "boolean" || typeof expected === "string"
    ? actual === expected
    : Math.abs(actual - expected) <= tolerance;
  if (!ok) failed++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label.padEnd(46)} ${ok ? actual : `${actual} / 期待 ${expected}`}`);
};

/*
 * 合成データ。前半（旧サイト）は表示回数が多くクリック率が低い、
 * 後半（新サイト）は露出は同じでクリック率だけ上がる、という形にする。
 * これで「サイト側の改善」を検出できるかを試す。
 */
const RELAUNCH = "2026-08-25";
const daily = [];
for (let i = 0; i < 60; i++) {
  const date = addDays("2026-07-07", i);
  const isAfter = date >= RELAUNCH;
  daily.push({
    date,
    impressions: 100,
    clicks: isAfter ? 6 : 2,
    position: isAfter ? 12 : 12,
  });
}

console.log("■ 合計の再計算（CTR は平均ではなく clicks ÷ impressions）");
const all = rollup(daily);
check("表示回数", all.impressions, 6000);
check("クリック", all.clicks, 49 * 2 + 11 * 6);  /* 7/7〜8/24 が49日、8/25〜9/4 が11日 */
check("CTR = クリック ÷ 表示", all.ctr, all.clicks / 6000, 1e-12);
check("日数", all.days, 60);

console.log("\n■ 掲載順位は表示回数で加重する");
const weighted = rollup([
  { date: "2026-01-01", impressions: 1000, clicks: 0, position: 10 },
  { date: "2026-01-02", impressions: 1, clicks: 0, position: 90 },
]);
check("加重平均（単純平均50位ではない）", weighted.position, (10 * 1000 + 90) / 1001, 1e-9);

console.log("\n■ 月次ロールアップ");
const byMonth = monthly(daily);
check("月数", byMonth.length, 3);
check("2026-07 の日数", byMonth[0].days, 25);
check("2026-08 の日数", byMonth[1].days, 31);
check("2026-08 のクリック", byMonth[1].clicks, 24 * 2 + 7 * 6);

console.log("\n■ 週次（欠けた週を描かない）");
const wk = weekly(daily, { weeks: 26 });
check("週の数（60日 → 完全な8週）", wk.length, 8);
check("最初の週は収録開始以降", wk[0].weekStart >= "2026-07-07", true);
check("最後の週は最終日で終わる", wk[wk.length - 1].weekEnd, "2026-09-04");
check("各週は7日ぶん", wk.every((w) => w.impressions === 700), true);

console.log("\n■ 収録範囲（旧サイトとの比較が取れるか）");
const cov = coverage(daily, RELAUNCH);
check("収録開始", cov.startsAt, "2026-07-07");
check("再構築前の日数", cov.beforeDays, 49);
check("前後比較が成立する", cov.coversRelaunch, true);
const shallow = coverage(daily.filter((r) => r.date >= "2026-08-20"), RELAUNCH);
check("前が5日しかなければ成立しない", shallow.coversRelaunch, false);
check("登録が再構築より後なら成立しない", coverage(daily.filter((r) => r.date >= RELAUNCH), RELAUNCH).coversRelaunch, false);

console.log("\n■ 前後比較（窓の長さを揃える）");
const cmp = relaunchComparison(daily, RELAUNCH, "2026-09-04");
check("後ろの窓", cmp.after.days, 11);
check("前の窓も同じ長さ", cmp.before.days, 11);
check("前の窓の開始", cmp.before.from, "2026-08-14");
check("表示回数は横ばい", cmp.change.impressions, 0, 1e-12);
check("クリックは3倍", cmp.change.clicks, 2, 1e-12);
check("判定はサイト側の改善", cmp.verdict, "site");

const exposure = relaunchComparison(
  daily.map((r) => ({ ...r, impressions: r.date >= RELAUNCH ? 300 : 100, clicks: r.date >= RELAUNCH ? 6 : 2 })),
  RELAUNCH, "2026-09-04",
);
check("露出だけ増えた場合の判定", exposure.verdict, "exposure");

console.log("\n■ 直販ファネル（予約日で数える／テスト予約を除く）");
const testId = (seed.testBookings?.ids || [])[0];
const bookings = [
  { id: 900001, channel: "Direct", arrival: "2026-11-21", departure: "2026-11-23", bookedAt: "2026-09-10 12:00:00", status: "confirmed" },
  { id: 900002, channel: "Direct", arrival: "2026-12-01", departure: "2026-12-02", bookedAt: "2026-06-01 09:00:00", status: "confirmed" },
  { id: 900003, channel: "Airbnb", arrival: "2026-11-21", departure: "2026-11-23", bookedAt: "2026-09-08 09:00:00", status: "confirmed" },
  { id: testId, channel: "Direct", arrival: "2026-10-14", departure: "2026-10-15", bookedAt: "2026-09-09 09:00:00", status: "cancelled" },
];
const sept = directBookingsBookedBetween(seed, bookings, "2026-09-01", "2026-09-30");
check("窓内の直販予約は1件", sept.count, 1);
check("残ったのは 900001 だけ", sept.ids.join(","), "900001");
check("テスト予約は除外（除外しなければ2件）", sept.ids.includes(testId), false);
check("OTA は数えない", sept.ids.includes(900003), false);
check("窓を6月に広げれば2件になる", directBookingsBookedBetween(seed, bookings, "2026-06-01", "2026-09-30").count, 2);
check("キャンセル済みは live から外れる",
  directBookingsBookedBetween(seed, [...bookings, { id: 900004, channel: "Direct", arrival: "2026-10-01", departure: "2026-10-02", bookedAt: "2026-09-12 09:00:00", status: "cancelled" }], "2026-09-01", "2026-09-30").live, 1);

/* 合成データは 9/4 で終わるので、9月の窓に入る日次は4日ぶんだけ */
const f = funnel(seed, daily, bookings, { from: "2026-09-01", to: "2026-09-30" });
check("クリックは窓内の日次のみ（4日 × 6）", f.clicks, 24);
check("転換率 = 予約 ÷ クリック", f.clickToBooking, 1 / 24, 1e-12);

console.log("\n■ ボトルネック判定（GA4 に進むべきか）");
check("クリックが少なく0件 → 到達", bottleneck({ clicks: 12, impressions: 400, position: 18, bookings: 0, clickToBooking: 0 }).key, "reach");
check("到達はあるが0件 → 転換（GA4の出番）", bottleneck({ clicks: 300, impressions: 9000, position: 8, bookings: 0, clickToBooking: 0 }).key, "conversion");
check("到達が少ないなら GA4 は不要", bottleneck({ clicks: 12, impressions: 400, position: 18, bookings: 0, clickToBooking: 0 }).needsGa4, false);
check("到達も成約もあれば converting", bottleneck({ clicks: 300, impressions: 9000, position: 8, bookings: 2, clickToBooking: 2 / 300 }).key, "converting");
/* 2026-09-17 の実績そのもの。転換率は高いが到達が薄い、を「健全」と読ませない */
const realCase = bottleneck({ clicks: 26, impressions: 172, position: 12, bookings: 2, clickToBooking: 2 / 26 });
check("成約ありでも到達が薄ければ露出が課題", realCase.key, "convertingLowReach");
check("その場合 GA4 はまだ不要", realCase.needsGa4, false);
check("予約1件あたりの表示回数", realCase.impressionsPerBooking, 86);

console.log(failed ? `\n❌ ${failed}件が不一致です` : "\n✅ すべて期待どおりです");
process.exit(failed ? 1 : 0);
