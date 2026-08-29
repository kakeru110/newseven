/**
 * Beds24 予約データの取得（Vercel Serverless Function）
 *
 * CLAUDE.md §2 の絶対条件により、APIトークンはフロントに出さない。
 * この関数だけがトークンを持ち、ブラウザには集計に必要な項目だけを返す。
 *
 * 環境変数:
 *   BEDS24_TOKEN … Beds24 の Long life token（読み取り専用）
 *
 * 返す項目は意図的に絞っている。宿泊者名・メール・住所・コメントは
 * 分析に使わないため、ここで落としてブラウザへは渡さない。
 */

const API = "https://api.beds24.com/v2";
const MAX_PAGES = 10;          // 安全弁。1ページ100件なので通常は2ページで足りる
const MONTHS_BACK = 13;
const MONTHS_AHEAD = 6;

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** ブラウザへ渡してよい項目だけを抜き出す（個人情報は持ち出さない） */
function toSafeBooking(b) {
  return {
    id: b.id,
    status: b.status,
    channel: b.channel,
    apiSource: b.apiSource || null,
    arrival: b.arrival,
    departure: b.departure,
    price: b.price,
    commission: b.commission,
    adults: b.numAdult,
    children: b.numChild,
    bookedAt: b.bookingTime || null,
    cancelledAt: b.cancelTime || null,
  };
}

export default async function handler(req, res) {
  const token = (process.env.BEDS24_TOKEN || "").trim();
  if (!token) {
    res.status(503).json({
      error: "BEDS24_TOKEN が未設定です。Vercel の Settings → Environment Variables で設定してください。",
    });
    return;
  }

  const today = new Date();
  const from = new Date(today.getFullYear(), today.getMonth() - MONTHS_BACK, 1);
  const to = new Date(today.getFullYear(), today.getMonth() + MONTHS_AHEAD + 1, 0);

  try {
    /**
     * 既定の取得にはキャンセルが含まれないため、status=cancelled を明示して2回取得する。
     * キャンセルは売上には影響しないが、キャンセル率の把握に必要（実測 18.7%）。
     */
    const bookings = [];
    for (const status of [null, "cancelled"]) {
      for (let page = 1; page <= MAX_PAGES; page++) {
        const url =
          `${API}/bookings?arrivalFrom=${iso(from)}&arrivalTo=${iso(to)}&page=${page}` +
          (status ? `&status=${status}` : "");
        const r = await fetch(url, { headers: { token, accept: "application/json" } });
        if (!r.ok) {
          const body = await r.text();
          res.status(502).json({ error: `Beds24 API がエラーを返しました（${r.status}）`, detail: body.slice(0, 300) });
          return;
        }
        const json = await r.json();
        bookings.push(...(json.data || []).map(toSafeBooking));
        if (!json.pages?.nextPageExists) break;
      }
    }

    /* Beds24 のクレジット上限（既定 100/5分）に配慮し、CDN 側で15分キャッシュする */
    res.setHeader("Cache-Control", "public, s-maxage=900, stale-while-revalidate=86400");
    res.status(200).json({
      fetchedAt: new Date().toISOString(),
      range: { from: iso(from), to: iso(to) },
      count: bookings.length,
      bookings,
    });
  } catch (err) {
    res.status(502).json({ error: "Beds24 API への接続に失敗しました", detail: String(err).slice(0, 300) });
  }
}
