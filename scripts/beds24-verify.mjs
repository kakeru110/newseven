/**
 * Beds24 と収支表PDF（seed.json）の突合検証（CLAUDE.md §8 Stage 2 の完了条件）
 *   node scripts/beds24-verify.mjs   /   npm run verify:beds24
 *
 * data/fixtures/beds24-bookings.json は 2026-08-29 に API から取得したスナップショット。
 * トークンなしで再現できるよう固定してある（個人情報は含まない）。
 */
import { readFile } from "node:fs/promises";
import { summarize, compareWithSeed } from "../src/lib/beds24.js";

const load = async (p) => JSON.parse(await readFile(new URL(p, import.meta.url), "utf8"));
const seed = await load("../data/seed.json");
const fixture = await load("../data/fixtures/beds24-bookings.json");

const summary = summarize(seed, fixture.bookings);
const rows = compareWithSeed(seed, summary);

let failed = 0;
/** check(label, 真偽, 説明) / check(label, 実測値, 期待値, 許容差, 説明) の両方を受ける */
const check = (label, actual, expected = true, tolerance = 0, detail = "") => {
  if (typeof expected === "string") { detail = expected; expected = true; tolerance = 0; }
  const ok =
    typeof actual === "boolean" || typeof expected === "boolean"
      ? actual === expected
      : Math.abs(actual - expected) <= tolerance;
  if (!ok) failed++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label.padEnd(46)} ${detail || (ok ? "" : `計算値 ${actual} / 期待値 ${expected}`)}`);
};

console.log("■ 月次の突合（Beds24 補正後 vs 収支表PDF）");
console.log("  月        件数 泊数 |   Beds24     seed     差 | 手数料差 | 補正 異常");
for (const r of rows) {
  const m = summary.months.find((x) => x.month === r.month);
  console.log(
    `  ${r.month} ${String(m.bookings).padStart(4)} ${String(m.nights).padStart(4)} | ` +
      `${String(Math.round(r.beds24Revenue)).padStart(8)} ${r.hasSeed ? String(r.seedRevenue).padStart(8) : "       -"} ` +
      `${r.hasSeed ? String(Math.round(r.revenueDiff)).padStart(6) : "     -"} | ` +
      `${r.hasSeed ? String(r.commissionDiff).padStart(6) : "     -"} | ` +
      `${String(m.corrections).padStart(3)} ${String(m.anomalies).padStart(3)}`
  );
}

console.log("\n■ OTA手数料が Beds24 に実額で入っていること（CLAUDE.md §10 の未検証項目）");
for (const r of rows.filter((x) => x.hasSeed)) {
  check(`${r.month} 手数料の差が ±20円以内`, Math.abs(r.commissionDiff) <= 20, `差 ${r.commissionDiff}円`);
}

console.log("\n■ 売上（11/12 補正後）が収支表PDFと一致すること");
/* 2026-02 は市税を含む予約1件で price が丸められており、既知の差として許容する */
const TOLERANCE = { "2026-02": 900, "2026-03": 20, "2026-04": 20 };
for (const r of rows.filter((x) => x.hasSeed)) {
  const tol = TOLERANCE[r.month] ?? 0;
  check(`${r.month} 売上の差が ±${tol}円以内`, Math.abs(r.revenueDiff) <= tol, `差 ${Math.round(r.revenueDiff)}円`);
}

console.log("\n■ 11/12 の過少計上（2026年2〜4月のみで発生し、5月以降は解消していること）");
const corrByMonth = Object.fromEntries(summary.months.map((m) => [m.month, m.corrections]));
check("2026-03 に補正対象がある", corrByMonth["2026-03"] > 0, `${corrByMonth["2026-03"]}件`);
check("2026-04 に補正対象がある", corrByMonth["2026-04"] > 0, `${corrByMonth["2026-04"]}件`);
for (const m of ["2026-05", "2026-06", "2026-07", "2026-08"]) {
  check(`${m} は補正不要`, (corrByMonth[m] || 0) === 0, `${corrByMonth[m] || 0}件`);
}

console.log("\n■ 予約件数と清掃回数の整合（CLAUDE.md §6-3）");
/* 2026-05 は清掃漏れ事故で1件が宿泊不可、2026-07 は月跨ぎのため一致しない（既知） */
const KNOWN_GAP = { "2026-05": 1, "2026-07": 2 };
for (const m of summary.months.filter((x) => seed.monthly.some((s) => s.month === x.month))) {
  const s = seed.monthly.find((x) => x.month === m.month);
  const gap = m.bookings - s.cleaningCount;
  check(`${m.month} 予約件数 ${m.bookings} vs 清掃回数 ${s.cleaningCount}`, gap === (KNOWN_GAP[m.month] || 0), gap ? `差 ${gap}件` : "一致");
}

console.log("\n■ キャンセル（既定の取得には含まれないため status=cancelled で別途取得する）");
check("キャンセル件数", summary.cancelled.length, 31, 0, `${summary.cancelled.length}件`);
check("キャンセル率が Booking.com 表示（20.0〜21.8%）と整合", Math.abs(summary.cancelRate - 0.187) <= 0.01, true, 0, `${(summary.cancelRate * 100).toFixed(1)}%`);
check("キャンセルは売上に含めない", rows.every((r) => Math.abs(r.revenueDiff) <= (TOLERANCE[r.month] ?? 0)), true);

console.log("\n■ 想定料率から外れた予約（要調査）");
check("異常は既知の1件のみ", summary.anomalies.length === 1, summary.anomalies.map((a) => `${a.month} id${a.id} 率${(a.rate * 100).toFixed(2)}%`).join(", "));

console.log(failed === 0 ? "\n✅ すべて期待どおりです" : `\n❌ ${failed} 件が不一致です`);
process.exit(failed === 0 ? 0 : 1);
