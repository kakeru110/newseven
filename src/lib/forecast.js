/**
 * 先行き（オン・ザ・ブックス）の売上・利益と、埋まりペースの判定
 *
 * 収支表PDFは翌月初にしか届かないので、将来月の情報源は Beds24 だけになる。
 * ここでは予約データを「宿泊日が属する月」へ配分して、月ごとの
 *   予約済み泊数 → 売上 → 変動費 → 限界利益 → 営業損益
 * を組み立てる。売上の計上月をチェックアウト月とする seed（§6-2）とは
 * 配分が違う点に注意。将来月は稼働と価格の判断に使うので、
 * 日単位で埋まり方が見える「宿泊日ベース」のほうが目的に合う。
 *
 * 変動費のうち OTA手数料だけは Beds24 の実額（commission）を使う。
 * 残り（清掃・運営サポート料・光熱・日用品）は単価マスタからの推計。
 */
import { ratesFor, contributionPerNight } from "./metrics.js";

const DAY = 86400000;
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isCancelled = (b) => String(b.status || "").toLowerCase() === "cancelled";
const dateOnly = (v) => (v ? String(v).slice(0, 10) : null);

export const daysInMonth = (month) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
};

export const monthOf = (isoDate) => isoDate.slice(0, 7);

/** 予約を1泊ずつに割る。売上・手数料は泊数で均等配分する */
export function nightsOf(b) {
  if (!b?.arrival || !b?.departure) return [];
  const total = Math.round((new Date(b.departure) - new Date(b.arrival)) / DAY);
  if (total <= 0) return [];
  const price = b.price || 0;
  const commission = b.commission || 0;
  const out = [];
  for (let i = 0; i < total; i++) {
    out.push({
      date: iso(new Date(new Date(b.arrival).getTime() + i * DAY)),
      revenue: price / total,
      commission: commission / total,
    });
  }
  return out;
}

/**
 * asOf 時点で「予約が入っていた」ものだけを残す。
 * キャンセル済みでも、asOf の時点でまだ生きていたなら当時は在庫を埋めていた。
 * 過去のペースを再現するにはこの扱いが要る。
 */
export function bookedAsOf(bookings, asOf) {
  if (!asOf) return (bookings || []).filter((b) => !isCancelled(b));
  return (bookings || []).filter((b) => {
    const booked = dateOnly(b.bookedAt);
    if (booked && booked > asOf) return false;
    if (!isCancelled(b)) return true;
    const cancelled = dateOnly(b.cancelledAt);
    return cancelled ? cancelled > asOf : false;
  });
}

/** asOf 時点で month に入っていた泊数と売上 */
export function onTheBooks(bookings, month, asOf = null) {
  let nights = 0, revenue = 0, commission = 0;
  for (const b of bookedAsOf(bookings, asOf)) {
    for (const n of nightsOf(b)) {
      if (monthOf(n.date) !== month) continue;
      nights += 1;
      revenue += n.revenue;
      commission += n.commission;
    }
  }
  return { nights, revenue, commission };
}

/** 月内のチェックアウト件数（＝清掃が発生する回数） */
function departuresIn(bookings, month, asOf = null) {
  return bookedAsOf(bookings, asOf).filter((b) => monthOf(b.departure || "") === month).length;
}

/**
 * 月別の予約済み損益。
 *
 * `assumedAlos` は「これから入る予約は、これまでと同じ長さで入る」という仮定。
 * 月内の予約が1件しかない月は実測ALOSが極端に長く出るため、
 * 追加1泊の限界利益の計算にはこちらを使う（長期予約1件で判断が歪むのを防ぐ）。
 */
export function monthlyForecast(seed, bookings, { months, asOf = null, assumedAlos = null, quotaByMonth = null }) {
  const fixedCost = latestFixedCost(seed);
  return months.map((month) => {
    const otb = onTheBooks(bookings, month, asOf);
    const stays = departuresIn(bookings, month, asOf);
    const rates = ratesFor(seed, month);
    const calendarDays = daysInMonth(month);

    const otaFee = otb.commission;
    const support = otb.revenue * rates.mgmtSupportRate * rates.taxMultiplier;
    const cleaning = stays * rates.cleaningPerStay;
    const perNight = otb.nights * (rates.utilitiesPerNight + rates.suppliesPerNight);
    const variableTotal = otaFee + support + cleaning + perNight;

    const contributionMargin = otb.revenue - variableTotal;
    const operatingProfit = contributionMargin - fixedCost;
    const adr = otb.nights ? otb.revenue / otb.nights : 0;
    const otaRate = otb.revenue ? otaFee / otb.revenue : 0;

    /* 追加1泊の限界利益。ALOS は仮定値（既定は月の実測）を使う */
    const alos = assumedAlos || (stays ? otb.nights / stays : 0);
    const marginalPerNight = adr && alos ? contributionPerNight(seed, { adr, otaRate, alos }, month) : 0;

    const openDays = calendarDays - otb.nights;
    const quota = quotaByMonth ? quotaByMonth[month] ?? null : null;
    const sellableDays = quota === null ? openDays : Math.max(0, Math.min(openDays, quota));

    return {
      month, calendarDays,
      nights: otb.nights,
      occupancy: otb.nights / calendarDays,
      stays,
      revenue: otb.revenue,
      adr, otaRate,
      variableCosts: { otaFee, support, cleaning, perNight, total: variableTotal },
      contributionMargin,
      fixedCost,
      operatingProfit,
      marginalPerNight,
      /* 営業損益が0になるまでに、あと何泊売る必要があるか */
      nightsToBreakEven: marginalPerNight > 0 && operatingProfit < 0
        ? -operatingProfit / marginalPerNight
        : 0,
      openDays,
      sellableDays,
      /* 規制枠が足りず、暦の空きを全部は売れない月 */
      quotaLimited: quota !== null && quota < openDays,
    };
  });
}

/** 直近の固定費（有効期間の考え方に合わせ、seed の最終月を採る） */
export function latestFixedCost(seed) {
  const last = seed.monthly[seed.monthly.length - 1];
  return Object.values(last.fixedCosts).reduce((a, b) => a + b, 0);
}

/**
 * 埋まりペースの判定。
 *
 * 対象月の「今のリードタイム」と同じ日数だけ手前の時点で、過去の各月が
 * 何泊入っていたかを再現して比べる。
 *
 * 着地の見込みは、比率ではなく「そこから何泊積み上がったか」（ピックアップ）で出す。
 * リードタイムが長い月は基準時点が0泊になりがちで、比率だと発散してしまうため。
 *
 * 季節性は補正していない（同じ月の前年実績がまだ無い）。サンプルも数ヶ月しか
 * ないので、当たり外れのある目安として読むこと。
 */
export function paceBenchmark(bookings, { month, asOf, history }) {
  const first = `${month}-01`;
  const leadDays = Math.round((new Date(first) - new Date(asOf)) / DAY);
  const current = onTheBooks(bookings, month, asOf);
  const calendarDays = daysInMonth(month);

  const samples = history
    .filter((h) => h < month)
    .map((h) => {
      const at = iso(new Date(new Date(`${h}-01`).getTime() - leadDays * DAY));
      const then = onTheBooks(bookings, h, at);
      const final = onTheBooks(bookings, h, null);
      return { month: h, nights: then.nights, finalNights: final.nights, pickup: final.nights - then.nights };
    });

  if (!samples.length) return { month, leadDays, nights: current.nights, revenue: current.revenue, samples, benchmark: null, landing: null, verdict: "unknown" };

  const sorted = (key) => samples.map((s) => s[key]).sort((a, b) => a - b);
  const median = (xs) => (xs.length % 2 ? xs[(xs.length - 1) / 2] : (xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2);
  const nights = sorted("nights");
  const pickups = sorted("pickup");
  const cap = (v) => Math.max(current.nights, Math.min(calendarDays, v));

  const benchmark = { min: nights[0], median: median(nights), max: nights[nights.length - 1], count: nights.length };
  return {
    month, leadDays,
    nights: current.nights,
    revenue: current.revenue,
    samples,
    benchmark,
    /* 現在の泊数に、過去の同リードタイムからの積み上がりを足したもの */
    landing: {
      low: cap(current.nights + pickups[0]),
      mid: cap(current.nights + median(pickups)),
      high: cap(current.nights + pickups[pickups.length - 1]),
      medianPickup: median(pickups),
    },
    /* 過去の幅に対する位置。幅そのものが広いので、断定ではなく目安。
       すでに始まっている月は「速い/遅い」を言っても打つ手が無いので判定しない */
    verdict: leadDays <= 0 ? "current"
      : current.nights > benchmark.max ? "ahead"
      : current.nights < benchmark.min ? "behind"
      : current.nights >= benchmark.median ? "onTrack" : "soft",
  };
}
