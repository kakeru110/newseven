/**
 * 住宅宿泊事業法の年間営業日数（180日）の消化状況と到達予測
 *
 * カウント期間は毎年4月1日正午から翌年4月1日正午まで。ここでは日付単位で扱い、
 * 1泊を1日として数える。境界日の扱いで自治体の解釈が入りうるため、
 * 定期報告の値と突き合わせて検証すること。
 */
const DAY = 86400000;
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isCancelled = (b) => String(b.status || "").toLowerCase() === "cancelled";

/** 指定日が属する事業年度（4月1日起算） */
export function fiscalYear(date, startMonth = 4) {
  const d = new Date(date);
  const y = d.getMonth() + 1 >= startMonth ? d.getFullYear() : d.getFullYear() - 1;
  return {
    start: `${y}-${pad(startMonth)}-01`,
    end: `${y + 1}-${pad(startMonth - 1 || 12)}-${new Date(y + 1, startMonth - 1, 0).getDate()}`,
    label: `${y}年度`,
  };
}

/** 宿泊した日（チェックアウト日は含めない）の集合。キャンセルは除く */
export function occupiedDates(bookings) {
  const set = new Set();
  for (const b of bookings || []) {
    if (!b?.arrival || !b?.departure || isCancelled(b)) continue;
    const nights = Math.round((new Date(b.departure) - new Date(b.arrival)) / DAY);
    for (let i = 0; i < nights; i++) set.add(iso(new Date(new Date(b.arrival).getTime() + i * DAY)));
  }
  return set;
}

const eachDate = (from, to, fn) => {
  for (let d = new Date(from); d <= new Date(to); d = new Date(d.getTime() + DAY)) fn(iso(d), d);
};

/** 現時点の消化状況（実績・予約済み・残り） */
export function consumption(bookings, { today, fy, limit = 180 }) {
  const occupied = occupiedDates(bookings);
  let stayed = 0, booked = 0;
  const byMonth = new Map();
  eachDate(fy.start, fy.end, (k) => {
    if (!occupied.has(k)) return;
    if (k <= today) stayed++; else booked++;
    const m = k.slice(0, 7);
    byMonth.set(m, (byMonth.get(m) || 0) + 1);
  });
  const total = stayed + booked;
  let cum = 0;
  const months = [...byMonth.entries()].sort().map(([month, nights]) => {
    cum += nights;
    return { month, nights, cumulative: cum, isPast: month <= today.slice(0, 7) };
  });
  return { stayed, booked, total, remaining: limit - total, limit, months };
}

/**
 * 今後も pace（泊/月）で埋まると仮定して、limit 泊目を迎える日を求める。
 * 既存予約はそのまま使い、不足分を空き日へ均等に配分する。
 */
export function project(bookings, { today, fy, limit = 180, pace }) {
  const occupied = occupiedDates(bookings);
  const filled = new Set();

  /* 月ごとに、既存予約＋不足分を割り当てる */
  const monthKeys = [];
  eachDate(fy.start, fy.end, (k) => {
    const m = k.slice(0, 7);
    if (!monthKeys.includes(m)) monthKeys.push(m);
  });
  for (const m of monthKeys) {
    const days = [];
    eachDate(`${m}-01`, iso(new Date(+m.slice(0, 4), +m.slice(5, 7), 0)), (k) => days.push(k));
    const already = days.filter((d) => occupied.has(d));
    const open = days.filter((d) => !occupied.has(d) && d > today);
    const need = Math.max(0, Math.min(pace, already.length + open.length) - already.length);
    const step = need > 0 ? open.length / need : 0;
    const extra = new Set();
    for (let i = 0; i < need; i++) extra.add(open[Math.floor(i * step)]);
    for (const d of days) if (occupied.has(d) || extra.has(d)) filled.add(d);
  }

  let cum = 0, reachDate = null;
  const series = [];
  eachDate(fy.start, fy.end, (k) => {
    if (filled.has(k)) {
      cum++;
      if (cum === limit && !reachDate) reachDate = k;
    }
    if (k.slice(8) === "01" || k === fy.end) {
      series.push({ date: k, month: k.slice(0, 7), cumulative: cum, isPast: k <= today });
    }
  });
  return { reachDate, totalAtYearEnd: cum, series };
}

/** 直近 n ヶ月の実績から1ヶ月あたりの泊数を求める */
export function recentPace(months, today, n = 3) {
  const past = months.filter((m) => m.isPast && m.month <= today.slice(0, 7));
  const use = past.slice(-n);
  if (!use.length) return 0;
  return use.reduce((s, m) => s + m.nights, 0) / use.length;
}
