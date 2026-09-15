/**
 * Search Console の集計（CLAUDE.md §3-5 / §9-2）
 *
 * 直販ファネルの最上段。api/searchconsole.js が返す日次の生値から、
 * 月次ロールアップ・サイト再構築の前後比較・予約への転換率を出す。
 *
 * 集計で必ず守ること:
 *   - CTR は clicks ÷ impressions で再計算する。日次 CTR の平均は誤り
 *     （表示回数の少ない日が同じ重みで効き、実態とずれる）。
 *   - 平均掲載順位は表示回数で加重する。Search Console 自身もそう計算している。
 */
import { isTestBooking, channelOf, isCancelled } from "./beds24.js";

const day = 86400000;
export const addDays = (isoDate, n) =>
  new Date(new Date(`${isoDate}T00:00:00Z`).getTime() + n * day).toISOString().slice(0, 10);

/** 表示回数で加重した掲載順位。行が無ければ 0 */
function weightedPosition(rows) {
  const imp = rows.reduce((s, r) => s + (r.impressions || 0), 0);
  if (!imp) return 0;
  return rows.reduce((s, r) => s + (r.position || 0) * (r.impressions || 0), 0) / imp;
}

/** 行の集合を1つの指標にまとめる。CTR と順位は再計算する */
export function rollup(rows) {
  const clicks = rows.reduce((s, r) => s + (r.clicks || 0), 0);
  const impressions = rows.reduce((s, r) => s + (r.impressions || 0), 0);
  return {
    clicks,
    impressions,
    ctr: impressions ? clicks / impressions : 0,
    position: weightedPosition(rows),
    days: rows.length,
  };
}

/** [from, to] の日次行を返す（両端を含む） */
export const slice = (daily, from, to) =>
  (daily || []).filter((r) => r.date && r.date >= from && r.date <= to);

/** 月次ロールアップ */
export function monthly(daily) {
  const byMonth = new Map();
  for (const r of daily || []) {
    const m = String(r.date).slice(0, 7);
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m).push(r);
  }
  return [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, rows]) => ({ month, ...rollup(rows) }));
}

/**
 * 週次ロールアップ。日次は振れが大きく、月次だと再構築の前後が同じ月に潰れるため。
 *
 * 収録範囲からはみ出す週は落とす。7日のうち3日しか収録が無い週をそのまま描くと
 * グラフの端が急落しているように見え、実際の減少と区別できなくなるため。
 * なお Search Console は表示が0の日を行ごと返さないので、
 * 「行が7本あるか」ではなく「週が収録範囲に収まっているか」で判定する。
 */
export function weekly(daily, { weeks = 26, endOn = null } = {}) {
  const rows = (daily || []).filter((r) => r.date);
  if (!rows.length) return [];
  const first = rows[0].date;
  const end = endOn || rows[rows.length - 1].date;
  const out = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const to = addDays(end, -7 * i);
    const from = addDays(to, -6);
    if (from < first) continue;          // 先頭の欠けた週は描かない
    out.push({ weekStart: from, weekEnd: to, ...rollup(slice(rows, from, to)) });
  }
  return out;
}

/**
 * データの収録範囲。
 * 「旧サイトとの比較が取れるか」はここで決まる（CLAUDE.md §9-2 の訂正）。
 * Search Console はプロパティ登録日より前を遡らないため、
 * 収録開始が再構築日より前でなければ前後比較は成立しない。
 */
export function coverage(daily, relaunchedOn) {
  const rows = (daily || []).filter((r) => r.date);
  if (!rows.length) return { empty: true, coversRelaunch: false };
  const startsAt = rows[0].date;
  const endsAt = rows[rows.length - 1].date;
  const beforeDays = relaunchedOn ? slice(rows, startsAt, addDays(relaunchedOn, -1)).length : 0;
  return {
    empty: false,
    startsAt,
    endsAt,
    days: rows.length,
    beforeDays,
    /* 前後比較には旧サイト側にも最低2週間は要る。数日では季節変動と区別できない */
    coversRelaunch: Boolean(relaunchedOn && startsAt < relaunchedOn && beforeDays >= 14),
  };
}

/**
 * サイト再構築の前後比較。
 * 窓は「再構築日から今日まで」と同じ長さを再構築日の直前に取る。
 * 長さを揃えないと、単に期間が長いほうの合計が大きく出るだけになる。
 */
export function relaunchComparison(daily, relaunchedOn, asOf) {
  const cov = coverage(daily, relaunchedOn);
  if (!relaunchedOn || cov.empty) return null;

  const end = asOf && asOf < cov.endsAt ? asOf : cov.endsAt;
  if (end < relaunchedOn) return null;
  const span = Math.round((new Date(`${end}T00:00:00Z`) - new Date(`${relaunchedOn}T00:00:00Z`)) / day) + 1;

  const after = slice(daily, relaunchedOn, end);
  const beforeFrom = addDays(relaunchedOn, -span);
  const before = slice(daily, beforeFrom, addDays(relaunchedOn, -1));

  const a = rollup(after);
  const b = rollup(before);
  const delta = (x, y) => (y ? (x - y) / y : null);

  return {
    available: cov.coversRelaunch,
    relaunchedOn,
    span,
    before: { ...b, from: beforeFrom, to: addDays(relaunchedOn, -1) },
    after: { ...a, from: relaunchedOn, to: end },
    change: {
      impressions: delta(a.impressions, b.impressions),
      clicks: delta(a.clicks, b.clicks),
      ctr: delta(a.ctr, b.ctr),
      /* 順位は小さいほど良いので符号を反転して「改善率」にする */
      position: b.position ? (b.position - a.position) / b.position : null,
    },
    /*
     * 再構築の効果を切り分ける読み方（CLAUDE.md §3-5）:
     *   表示回数が横ばいでクリックが増えた → サイト側（UX・タイトル）の改善
     *   表示回数ごと増えた                 → 検索順位・露出の変化
     */
    verdict: verdictOf(a, b, cov.coversRelaunch),
  };
}

function verdictOf(after, before, available) {
  if (!available || !before.impressions) return "insufficient";
  const impUp = (after.impressions - before.impressions) / before.impressions;
  const ctrUp = before.ctr ? (after.ctr - before.ctr) / before.ctr : 0;
  if (ctrUp > 0.15 && impUp < 0.15) return "site";        // 露出は同じでクリック率が上がった
  if (impUp > 0.15 && ctrUp <= 0.15) return "exposure";   // 露出そのものが増えた
  if (impUp > 0.15 && ctrUp > 0.15) return "both";
  return "flat";
}

/** 直販予約（テスト予約を除く）を予約日で数える。転換の分子はチェックイン日ではなく予約日 */
export function directBookingsBookedBetween(seed, bookings, from, to) {
  const rows = (bookings || []).filter((b) => {
    if (!b || isTestBooking(seed, b)) return false;
    if (channelOf(b.channel) !== "direct") return false;
    const at = String(b.bookedAt || b.bookingTime || "").slice(0, 10);
    return at && at >= from && at <= to;
  });
  return {
    count: rows.length,
    cancelled: rows.filter(isCancelled).length,
    live: rows.filter((b) => !isCancelled(b)).length,
    ids: rows.map((b) => b.id),
  };
}

/**
 * 直販ファネル: 表示回数 → クリック → 予約。
 *
 * クリック数は「Google 自然検索から来た人」であって訪問者の全数ではない。
 * 直接入力・他サイトからのリンク・他の検索エンジンは含まれないため、
 * 訪問数の下限として読む。したがって成約率は上限側に振れる。
 */
export function funnel(seed, daily, bookings, { from, to }) {
  const search = rollup(slice(daily, from, to));
  const booked = directBookingsBookedBetween(seed, bookings, from, to);
  return {
    from,
    to,
    impressions: search.impressions,
    clicks: search.clicks,
    ctr: search.ctr,
    position: search.position,
    bookings: booked.count,
    bookingsLive: booked.live,
    bookingsCancelled: booked.cancelled,
    /* クリックが訪問の下限なので、この率は実態より高めに出る */
    clickToBooking: search.clicks ? booked.count / search.clicks : 0,
    impressionToBooking: search.impressions ? booked.count / search.impressions : 0,
  };
}

/**
 * ボトルネックの判定。GA4 に進むべきかをここで決める（CLAUDE.md §3-5）。
 *   到達が無い     → サイトではなく露出の問題。GA4 を入れても何も分からない
 *   到達はあるが0件 → サイト内で落ちている。ここで初めて GA4 の出番
 */
export function bottleneck(f, { clicksNeeded = 100 } = {}) {
  if (f.clicks < clicksNeeded && f.bookings === 0) {
    return { key: "reach", needsGa4: false,
      label: "到達が足りない",
      detail: `期間中のクリックは ${f.clicks} 件。サイト内の改善より先に、検索での露出（表示回数 ${f.impressions.toLocaleString("ja-JP")}・平均順位 ${f.position.toFixed(1)}位）が課題です。GA4 を入れても母数が足りず判断できません。` };
  }
  if (f.clicks >= clicksNeeded && f.bookings === 0) {
    return { key: "conversion", needsGa4: true,
      label: "到達はあるが予約に至っていない",
      detail: `クリック ${f.clicks} 件に対し予約 0 件。サイト内のどこで落ちているかを見る必要があるため、ここで GA4 の出番です。` };
  }
  return { key: "converting", needsGa4: f.clicks >= clicksNeeded,
    label: "成約している",
    detail: `クリック ${f.clicks} 件から ${f.bookings} 件が成約（${(f.clickToBooking * 100).toFixed(1)}%）。クリック数は自然検索のみの下限値なので、実際の成約率はこれより低くなります。` };
}
