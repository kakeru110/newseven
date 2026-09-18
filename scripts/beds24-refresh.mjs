/**
 * Beds24 の予約スナップショットを更新する
 *   BEDS24_TOKEN=xxx npm run refresh:beds24
 *
 * GitHub Actions（.github/workflows/beds24-refresh.yml）が毎日これを実行し、
 * 差分があれば `data/fixtures/beds24-bookings.json` をコミットする。
 * おかげで**トークンを持たないセッションでも前日までの予約で作業できる**
 * （CLAUDE.md §11）。
 *
 * 保存するのは `toSafeBooking()` を通した項目だけ。
 * 宿泊者名・メール・電話・住所・コメントはここに到達する前に落としている。
 */
import { writeFile, readFile } from "node:fs/promises";
import { fetchAllBookings, defaultRange } from "../src/lib/beds24-fetch.js";

const OUT = new URL("../data/fixtures/beds24-bookings.json", import.meta.url);

const token = (process.env.BEDS24_TOKEN || "").trim();
if (!token) {
  console.error("BEDS24_TOKEN が未設定です。");
  console.error("  ローカル : BEDS24_TOKEN=xxx npm run refresh:beds24");
  console.error("  CI       : リポジトリの Settings → Secrets and variables → Actions に追加");
  process.exit(1);
}

const before = await readFile(OUT, "utf8").then(JSON.parse).catch(() => null);
const result = await fetchAllBookings(token, defaultRange());

/* fetchedAt は毎回変わるので、差分判定からは外す。
   これを入れると中身が同じでも毎日コミットが積まれる。 */
const same =
  before && JSON.stringify(before.bookings) === JSON.stringify(result.bookings);

await writeFile(OUT, JSON.stringify({ fetchedAt: new Date().toISOString(), ...result }, null, 2) + "\n");

const prev = before?.bookings?.length ?? 0;
console.log(`取得 ${result.count}件（前回 ${prev}件 ／ ${before?.fetchedAt ?? "なし"}）`);
console.log(`範囲 ${result.range.from} 〜 ${result.range.to}`);
console.log(same ? "変化なし" : "変化あり");

/* ワークフロー側が判定に使う */
if (process.env.GITHUB_OUTPUT) {
  await writeFile(process.env.GITHUB_OUTPUT, `changed=${same ? "false" : "true"}\n`, { flag: "a" });
}
