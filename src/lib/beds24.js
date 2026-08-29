/**
 * Beds24 予約データの正規化・検証・集計
 *
 * 収支表PDFとの突合（2026年2〜8月）で分かったこと:
 *  - OTA手数料は commission フィールドに実額で入っている。全期間でPDFと一致（月合計の差は最大2円）
 *  - Booking.com の一部予約で price が実額の 11/12（8.33%減）になっている。2026年2〜4月に発生し
 *    5月以降は解消。commission は正しいため、commission ÷ price が想定料率から外れることで検出できる
 *  - 売上の計上月はチェックイン月。予約件数は清掃回数と一致する
 *
 * そのため「commission と costRates を正とし、price を検算する」方針をとる。
 * 想定料率から外れた予約は 11/12 補正を試し、それでも合わなければ異常として報告する。
 */
import { resolveRate } from "./metrics.js";

/** commission ÷ price と想定料率の許容差 */
export const RATE_TOLERANCE = 0.0015;

/** Beds24 の channel 値をダッシュボードのチャネルキーへ寄せる */
export function channelOf(raw) {
  const v = String(raw || "").toLowerCase();
  if (v.includes("airbnb")) return "airbnb";
  if (v.includes("booking")) return "booking";
  if (v === "direct" || v.includes("website") || v === "") return "direct";
  return "other";
}

export const CHANNEL_LABEL = { airbnb: "Airbnb", booking: "Booking.com", direct: "直販", other: "その他" };

/** その月にありうる OTA 料率（costRates から日付で解決する） */
export function expectedRatesFor(seed, channel, month) {
  if (channel === "airbnb") {
    return [resolveRate(seed, "ota_rate_airbnb", month)].filter((v) => v != null);
  }
  if (channel === "booking") {
    return ["ota_rate_booking_base", "ota_rate_booking_promo"]
      .map((k) => resolveRate(seed, k, month))
      .filter((v) => v != null);
  }
  return [0];   // 直販は手数料なし
}

export const nightsOf = (b) =>
  Math.max(0, Math.round((new Date(b.departure) - new Date(b.arrival)) / 86400000));

/**
 * 1予約を正規化し、料率の妥当性を判定する。
 * price が 11/12 に過少計上されている場合は補正した金額を revenue とする。
 */
export function normalizeBooking(seed, b) {
  const month = String(b.arrival).slice(0, 7);
  const channel = channelOf(b.channel);
  const priceRaw = Number(b.price) || 0;
  const commission = Number(b.commission) || 0;
  const rates = expectedRatesFor(seed, channel, month);
  const fits = (p) => p > 0 && rates.some((r) => Math.abs(commission / p - r) <= RATE_TOLERANCE);

  let revenue = priceRaw;
  let correction = null;
  let anomaly = false;
  if (priceRaw > 0 && rates.length) {
    if (fits(priceRaw)) {
      /* 想定どおり */
    } else if (fits((priceRaw * 12) / 11)) {
      revenue = Math.round((priceRaw * 12) / 11);
      correction = "11/12";
    } else {
      anomaly = true;
    }
  }

  return {
    id: b.id,
    month,
    channel,
    arrival: b.arrival,
    departure: b.departure,
    nights: nightsOf(b),
    priceRaw,
    revenue,
    commission,
    rate: priceRaw ? commission / priceRaw : 0,
    correctedRate: revenue ? commission / revenue : 0,
    correction,
    anomaly,
    status: b.status,
    bookedAt: b.bookedAt || b.bookingTime || null,
    guests: (Number(b.adults ?? b.numAdult) || 0) + (Number(b.children ?? b.numChild) || 0),
  };
}

const emptyBucket = () => ({
  bookings: 0, nights: 0, revenue: 0, revenueRaw: 0, commission: 0, corrections: 0, anomalies: 0,
});

/** 月次・チャネル別に集計する（売上の計上月はチェックイン月） */
export const isCancelled = (b) => String(b.status || "").toLowerCase() === "cancelled";

export function summarize(seed, rawBookings) {
  const valid = rawBookings.filter((b) => b && b.arrival && b.departure);
  /* キャンセルは売上に含めないが、件数はキャンセル率のために数える */
  const cancelled = valid.filter(isCancelled).map((b) => normalizeBooking(seed, b));
  const normalized = valid.filter((b) => !isCancelled(b)).map((b) => normalizeBooking(seed, b));

  const byMonth = new Map();
  for (const b of normalized) {
    if (!byMonth.has(b.month)) byMonth.set(b.month, { month: b.month, ...emptyBucket(), byChannel: {} });
    const m = byMonth.get(b.month);
    const c = (m.byChannel[b.channel] ||= emptyBucket());
    for (const bucket of [m, c]) {
      bucket.bookings += 1;
      bucket.nights += b.nights;
      bucket.revenue += b.revenue;
      bucket.revenueRaw += b.priceRaw;
      bucket.commission += b.commission;
      if (b.correction) bucket.corrections += 1;
      if (b.anomaly) bucket.anomalies += 1;
    }
  }

  const cancelledByMonth = new Map();
  for (const b of cancelled) cancelledByMonth.set(b.month, (cancelledByMonth.get(b.month) || 0) + 1);
  for (const m of cancelledByMonth.keys()) {
    if (!byMonth.has(m)) byMonth.set(m, { month: m, ...emptyBucket(), byChannel: {} });
  }

  const months = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
  for (const m of months) {
    m.adr = m.nights ? m.revenue / m.nights : 0;
    m.effectiveRate = m.revenue ? m.commission / m.revenue : 0;
    m.cancelled = cancelledByMonth.get(m.month) || 0;
    /* キャンセル率 = キャンセル ÷（成立 + キャンセル） */
    m.cancelRate = m.bookings + m.cancelled ? m.cancelled / (m.bookings + m.cancelled) : 0;
  }

  const totalBookings = normalized.length;
  return {
    months,
    bookings: normalized,
    cancelled,
    cancelRate: totalBookings + cancelled.length ? cancelled.length / (totalBookings + cancelled.length) : 0,
    anomalies: normalized.filter((b) => b.anomaly),
    corrections: normalized.filter((b) => b.correction),
  };
}

/** 指定月の Beds24 集計と seed の実績を比較する（突合表用） */
export function compareWithSeed(seed, summary) {
  return summary.months.map((m) => {
    const s = seed.monthly.find((x) => x.month === m.month);
    return {
      month: m.month,
      beds24Revenue: m.revenue,
      beds24Commission: m.commission,
      seedRevenue: s ? s.revenue.total : null,
      seedCommission: s ? s.variableCosts.otaFee : null,
      revenueDiff: s ? m.revenue - s.revenue.total : null,
      commissionDiff: s ? m.commission - s.variableCosts.otaFee : null,
      isProvisional: s ? s.isProvisional : null,
      hasSeed: !!s,
      corrections: m.corrections,
      anomalies: m.anomalies,
    };
  });
}

/** 今月以降の先行予約（収支表PDFには存在しない情報） */
export function pacing(summary, fromMonth) {
  return summary.months.filter((m) => m.month >= fromMonth);
}
