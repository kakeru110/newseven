/**
 * 180日規制の計算の検証
 *   npm run verify:regulation
 */
import { readFile } from "node:fs/promises";
import { fiscalYear, consumption, project, recentPace } from "../src/lib/regulation.js";

const fixture = JSON.parse(await readFile(new URL("../data/fixtures/beds24-bookings.json", import.meta.url), "utf8"));
const TODAY = "2026-09-04";   // スナップショットの取得日
const fy = fiscalYear(TODAY);

let failed = 0;
const check = (label, actual, expected, tolerance = 0, detail = "") => {
  const ok = typeof expected === "boolean" || typeof expected === "string"
    ? actual === expected
    : Math.abs(actual - expected) <= tolerance;
  if (!ok) failed++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label.padEnd(44)} ${detail || (ok ? actual : `${actual} / 期待 ${expected}`)}`);
};

console.log("■ 事業年度の判定（4月1日起算）");
check("2026-09-04 が属する年度の開始", fiscalYear(TODAY).start === "2026-04-01", true, 0, fiscalYear(TODAY).start);
check("2026-09-04 が属する年度の終了", fiscalYear(TODAY).end === "2027-03-31", true, 0, fiscalYear(TODAY).end);
check("2026-03-15 は前年度になる", fiscalYear("2026-03-15").start === "2025-04-01", true, 0, fiscalYear("2026-03-15").start);

console.log("\n■ 消化状況（2026-09-04 時点のスナップショット。年度末までの予約を含む）");
const c = consumption(fixture.bookings, { today: TODAY, fy });
console.log(`  実績 ${c.stayed}日 / 予約済み ${c.booked}日 / 合計 ${c.total}日 / 残り ${c.remaining}日`);
check("実績（4/1〜9/4）", c.stayed, 118);
check("合計が実績＋予約済みと一致", c.total, c.stayed + c.booked);
check("残り＝180−合計", c.remaining, 180 - c.total);
check("月次の累計が単調増加", c.months.every((m, i) => i === 0 || m.cumulative >= c.months[i - 1].cumulative), true);

console.log("\n■ 到達予測（ペースを上げるほど到達が早い）");
const dates = [20, 24, 28].map((p) => project(fixture.bookings, { today: TODAY, fy, pace: p }).reachDate);
console.log("  20泊/月 " + dates[0] + " ／ 24泊/月 " + dates[1] + " ／ 28泊/月 " + dates[2]);
check("ペースが速いほど到達日が早い", dates[0] > dates[1] && dates[1] > dates[2], true);
/* 2026-09-04 時点で、確定済みの予約だけで上限に達する（残り0日）。
   新規予約が1件も入らなくても 2027-02-01 に180泊目を迎える。 */
check("残り枠がゼロ", c.remaining, 0);
check("新規予約が無くても上限に達する", project(fixture.bookings, { today: TODAY, fy, pace: 0 }).reachDate, "2027-02-01", 0,
  project(fixture.bookings, { today: TODAY, fy, pace: 0 }).reachDate);

console.log("\n■ 直近3ヶ月の実績ペース");
const pace = recentPace(c.months, TODAY, 3);
check("0より大きい", pace > 0, true, 0, pace.toFixed(1) + "泊/月");

console.log(failed === 0 ? "\n✅ すべて期待どおりです" : `\n❌ ${failed} 件が不一致です`);
process.exit(failed === 0 ? 0 : 1);
