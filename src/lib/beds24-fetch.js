/**
 * Beds24 からの取得と個人情報の除去（サーバー側専用）
 *
 * `api/beds24.js`（ブラウザからの都度取得）と
 * `scripts/beds24-refresh.mjs`（GitHub Actions からの日次更新）の両方が使う。
 * 片方だけ直して食い違うのを防ぐため、取得と整形はここに集約する。
 *
 * **このファイルをブラウザ向けのバンドルに import しないこと。**
 * トークンを扱う前提で書かれている（CLAUDE.md §2 の絶対条件）。
 */

const API = "https://api.beds24.com/v2";
const MAX_PAGES = 10;          // 安全弁。1ページ100件なので通常は2ページで足りる
export const MONTHS_BACK = 13;
export const MONTHS_AHEAD = 6;

const pad = (n) => String(n).padStart(2, "0");
export const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** 保存・送信してよい項目だけを抜き出す。宿泊者名・メール・電話・住所・コメントは落とす */
export function toSafeBooking(b) {
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

/** 既定の取得範囲（今日を基準に過去13ヶ月〜先6ヶ月） */
export function defaultRange(today = new Date()) {
  return {
    from: new Date(today.getFullYear(), today.getMonth() - MONTHS_BACK, 1),
    to: new Date(today.getFullYear(), today.getMonth() + MONTHS_AHEAD + 1, 0),
  };
}

/**
 * 予約を全件取得する。
 *
 * **キャンセルは既定の取得に含まれない**ため `status=cancelled` を明示して2回取得する
 * （CLAUDE.md §3-2）。キャンセル率の把握と、過去のオン・ザ・ブックス再現に要る。
 */
export async function fetchAllBookings(token, { from, to } = defaultRange()) {
  const bookings = [];
  for (const status of [null, "cancelled"]) {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const url =
        `${API}/bookings?arrivalFrom=${iso(from)}&arrivalTo=${iso(to)}&page=${page}` +
        (status ? `&status=${status}` : "");
      const r = await fetch(url, { headers: { token, accept: "application/json" } });
      if (!r.ok) {
        const body = await r.text();
        const err = new Error(`Beds24 API がエラーを返しました（${r.status}）: ${body.slice(0, 300)}`);
        err.status = r.status;
        throw err;
      }
      const json = await r.json();
      bookings.push(...(json.data || []).map(toSafeBooking));
      if (!json.pages?.nextPageExists) break;
    }
  }
  /* 差分を読みやすくするため id 順に固定する（取得順はページングで揺れるため） */
  bookings.sort((a, b) => Number(a.id) - Number(b.id));
  return { range: { from: iso(from), to: iso(to) }, count: bookings.length, bookings };
}
