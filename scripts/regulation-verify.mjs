/**
 * 180日規制の計算の検証
 *   npm run verify:regulation
 */
import { readFile } from "node:fs/promises";
import { fiscalYear, consumption, project, recentPace } from "../src/lib/regulation.js";

const fixture = JSON.parse(await readFile(new URL("../data/fixtures/beds24-bookings.json", import.meta.url), "utf8"));
const TODAY = "2026-08-29";
const fy = fiscalYear(TODAY);

let failed = 0;
const check = (label, actual, expected, tolerance = 0, detail = "") => {
  const ok = typeof expected === "boolean" ? actual === expected : Math.abs(actual - expected) <= tolerance;
  if (!ok) failed++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label.padEnd(44)} ${detail || (ok ? actual : `${actual} / 期待 ${expected}`)}`);
};

console.log("■ 事業年度の判定（4月1日起算）");
check("2026-08-29 が属する年度の開始", fiscalYear("2026-08-29").start === "2026-04-01", true, 0, fiscalYear("2026-08-29").start);
check("2026-08-29 が属する年度の終了", fiscalYear("2026-08-29").end === "2027-03-31", true, 0, fiscalYear("2026-08-29").end);
check("2026-03-15 は前年度になる", fiscalYear("2026-03-15").start === "2025-04-01", true, 0, fiscalYear("2026-03-15").start);

console.log("\n■ 消化状況（スナップショットは2026-08-29時点・9月末までの予約のみ）");
const c = consumption(fixture.bookings, { today: TODAY, fy });
console.log(`  実績 ${c.stayed}日 / 予約済み ${c.booked}日 / 合計 ${c.total}日 / 残り ${c.remaining}日`);
check("実績（4/1〜8/29）", c.stayed, 114);
check("合計が実績＋予約済みと一致", c.total, c.stayed + c.booked);
check("残り＝180−合計", c.remaining, 180 - c.total);
check("月次の累計が単調増加", c.months.every((m, i) => i === 0 || m.cumulative >= c.months[i - 1].cumulative), true);

console.log("\n■ 到達予測（ペースを上げるほど到達が早い）");
const dates = [20, 24, 28].map((p) => project(fixture.bookings, { today: TODAY, fy, pace: p }).reachDate);
console.log("  20泊/月 " + dates[0] + " ／ 24泊/月 " + dates[1] + " ／ 28泊/月 " + dates[2]);
check("ペースが速いほど到達日が早い", dates[0] > dates[1] && dates[1] > dates[2], true);
check("予約が一切入らなければ到達しない", project(fixture.bookings, { today: TODAY, fy, pace: 0 }).reachDate === null, true);

console.log("\n■ 直近3ヶ月の実績ペース");
const pace = recentPace(c.months, TODAY, 3);
check("0より大きい", pace > 0, true, 0, pace.toFixed(1) + "泊/月");

console.log(failed === 0 ? "\n✅ すべて期待どおりです" : `\n❌ ${failed} 件が不一致です`);
process.exit(failed === 0 ? 0 : 1);
