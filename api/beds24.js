/**
 * Beds24 予約データの取得（Vercel Serverless Function）
 *
 * CLAUDE.md §2 の絶対条件により、APIトークンはフロントに出さない。
 * この関数だけがトークンを持ち、ブラウザには集計に必要な項目だけを返す。
 *
 * 環境変数:
 *   BEDS24_TOKEN … Beds24 の Long life token（読み取り専用）
 *
 * 取得と個人情報の除去は `src/lib/beds24-fetch.js` に集約している
 * （GitHub Actions の日次更新と同じ処理を使うため）。
 */
import { fetchAllBookings, defaultRange } from "../src/lib/beds24-fetch.js";

export default async function handler(req, res) {
  const token = (process.env.BEDS24_TOKEN || "").trim();
  if (!token) {
    res.status(503).json({
      error: "BEDS24_TOKEN が未設定です。Vercel の Settings → Environment Variables で設定してください。",
    });
    return;
  }

  try {
    const result = await fetchAllBookings(token, defaultRange());
    /* Beds24 のクレジット上限（既定 100/5分）に配慮し、CDN 側で15分キャッシュする */
    res.setHeader("Cache-Control", "public, s-maxage=900, stale-while-revalidate=86400");
    res.status(200).json({ fetchedAt: new Date().toISOString(), ...result });
  } catch (err) {
    res.status(502).json({
      error: "Beds24 API への接続に失敗しました",
      detail: String(err.message || err).slice(0, 300),
    });
  }
}
