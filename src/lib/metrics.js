/**
 * 指標計算（CLAUDE.md §5 / seed.json の formulas に一対一で対応）
 *
 * 原則:
 *  - seed.json の生値からのみ計算する。結果はハードコードしない。
 *  - 単価・料率は costRates（有効期間付き）から日付で解決する。
 *    Booking.com の料率は 2026-06 に 13.30% → 14.30% へ変わっており、
 *    ハードコードすると過去月の再計算が壊れる（CLAUDE.md §12 制約）。
 */

/** "2026-06" / "2026-06-01" → その月の初日（料率解決の基準日） */
export function monthStart(month) {
  return `${String(month).slice(0, 7)}-01`;
}

/**
 * costRates を日付で解決する。
 * validFrom <= 基準日 かつ（validTo が null または 基準日 <= validTo）のものを返す。
 * 同一キーで複数該当した場合は validFrom が最も新しいものを採用。
 */
export function resolveRate(seed, key, month) {
  const at = monthStart(month);
  const hit = seed.costRates
    .filter((r) => r.key === key)
    .filter((r) => r.validFrom <= at && (r.validTo == null || at <= r.validTo))
    .sort((a, b) => (a.validFrom < b.validFrom ? 1 : -1))[0];
  return hit ? hit.value : null;
}

/** 対象月に適用される単価・料率をまとめて解決する */
export function ratesFor(seed, month) {
  return {
    cleaningPerStay: resolveRate(seed, "cleaning_total_per_stay_incl_tax", month),
    utilitiesPerNight: resolveRate(seed, "utilities_per_night", month),
    suppliesPerNight: resolveRate(seed, "supplies_per_night", month),
    mgmtSupportRate: resolveRate(seed, "mgmt_support_rate_excl_tax", month),
    taxMultiplier: resolveRate(seed, "consumption_tax_multiplier", month),
    otaAirbnb: resolveRate(seed, "ota_rate_airbnb", month),
    otaBooking: resolveRate(seed, "ota_rate_booking_base", month),
    otaBookingPromo: resolveRate(seed, "ota_rate_booking_promo", month),
  };
}

const sum = (obj) => Object.values(obj).reduce((s, v) => s + (v || 0), 0);

/** 月次指標。seed.monthly の 1 レコードから派生値をすべて計算する */
export function monthMetrics(seed, row) {
  const vc = row.variableCosts;
  const variableCostTotal =
    vc.cleaningTotalInclTax + vc.otaFee + vc.mgmtSupportFeeInclTax + vc.utilities + vc.supplies;
  const revenue = row.revenue.total;
  const contributionMargin = revenue - variableCostTotal;
  const contributionMarginRate = revenue ? contributionMargin / revenue : 0;
  const fixedCostTotal = sum(row.fixedCosts);
  const operatingProfit = contributionMargin - fixedCostTotal;
  const occupancyRate = row.calendarDays ? row.nightsActual / row.calendarDays : 0;
  const adr = row.nightsRevenue ? revenue / row.nightsRevenue : 0;
  const alos = row.cleaningCount ? row.nightsActual / row.cleaningCount : 0;
  const breakEvenRevenue = contributionMarginRate > 0 ? fixedCostTotal / contributionMarginRate : null;
  const breakEvenOccupancy =
    breakEvenRevenue && adr && row.calendarDays ? breakEvenRevenue / adr / row.calendarDays : null;

  return {
    ...row,
    revenueTotal: revenue,
    variableCostTotal,
    contributionMargin,
    contributionMarginRate,
    fixedCostTotal,
    operatingProfit,
    occupancyRate,
    adr,
    alos,
    breakEvenRevenue,
    breakEvenOccupancy,
  };
}

/** 全月の指標（seed の並び順を維持） */
export function allMonths(seed) {
  return seed.monthly.map((row) => monthMetrics(seed, row));
}

/**
 * 期間通算。
 * 率は「合計 ÷ 合計」で求める（月次の率を単純平均しない）。
 * 平均稼働率 = 実泊数合計 ÷ 暦日数合計。
 */
export function periodTotals(seed) {
  const ms = allMonths(seed);
  const acc = (f) => ms.reduce((s, m) => s + f(m), 0);
  const revenue = acc((m) => m.revenueTotal);
  const variableCostTotal = acc((m) => m.variableCostTotal);
  const fixedCostTotal = acc((m) => m.fixedCostTotal);
  const contributionMargin = revenue - variableCostTotal;
  const otaFee = acc((m) => m.variableCosts.otaFee);
  const nightsActual = acc((m) => m.nightsActual);
  const nightsRevenue = acc((m) => m.nightsRevenue);
  const calendarDays = acc((m) => m.calendarDays);
  const cleaningCount = acc((m) => m.cleaningCount);
  return {
    months: ms.length,
    revenue,
    variableCostTotal,
    otaFee,
    contributionMargin,
    contributionMarginRate: revenue ? contributionMargin / revenue : 0,
    fixedCostTotal,
    operatingProfit: contributionMargin - fixedCostTotal,
    nightsActual,
    nightsRevenue,
    calendarDays,
    cleaningCount,
    occupancyRate: calendarDays ? nightsActual / calendarDays : 0,
    adr: nightsRevenue ? revenue / nightsRevenue : 0,
    alos: cleaningCount ? nightsActual / cleaningCount : 0,
    hasProvisional: ms.some((m) => m.isProvisional),
    provisionalMonths: ms.filter((m) => m.isProvisional).map((m) => m.month),
  };
}

/**
 * 損益分岐価格 P(N)（CLAUDE.md §5）
 *   P(N) = (清掃単価 / N + 泊単価) / (1 − OTA料率 − 運営サポート料率 × 消費税)
 * 固定費は含めない（追加1泊の可否は限界利益で決まるため）。
 */
export function breakEvenPricePerNight(seed, nights, otaRate, month) {
  const r = ratesFor(seed, month);
  const perNight = r.utilitiesPerNight + r.suppliesPerNight;
  const denominator = 1 - otaRate - r.mgmtSupportRate * r.taxMultiplier;
  if (denominator <= 0 || !nights) return null;
  return (r.cleaningPerStay / nights + perNight) / denominator;
}

/** チャネル別 1泊あたり限界利益（CLAUDE.md §5） */
export function contributionPerNight(seed, { adr, otaRate, alos }, month) {
  const r = ratesFor(seed, month);
  if (!alos) return null;
  return (
    adr * (1 - otaRate - r.mgmtSupportRate * r.taxMultiplier) -
    r.cleaningPerStay / alos -
    r.utilitiesPerNight -
    r.suppliesPerNight
  );
}

export const CHANNEL_LABELS = { airbnb: "Airbnb", booking: "Booking.com", direct: "直販" };

/**
 * チャネル別の通算集計。
 * 内訳が無い月（2026-03 / 2026-08）は seed.channelMonths に含まれないため自動的に除外される。
 */
export function channelSummary(seed) {
  const months = seed.channelMonths;
  const lastMonth = months[months.length - 1];
  return Object.keys(seed.channelMonthly).map((key) => {
    const src = seed.channelMonthly[key];
    const rows = months.filter((m) => src[m]).map((m) => ({ month: m, ...src[m] }));
    const acc = (f) => rows.reduce((s, r) => s + (f(r) || 0), 0);
    const revenue = acc((r) => r.revenue);
    const nights = acc((r) => r.nights);
    const bookings = acc((r) => r.bookings);
    const otaFee = acc((r) => r.otaFee);
    const promoAmount = acc((r) => r.promoAmount);
    const adr = nights ? revenue / nights : 0;
    const otaRate = revenue ? otaFee / revenue : 0;   // 実料率（seed の実額から逆算）
    const alos = bookings ? nights / bookings : 0;
    return {
      key,
      label: CHANNEL_LABELS[key] || key,
      months,
      rows,
      revenue,
      nights,
      bookings,
      otaFee,
      promoAmount,
      adr,
      otaRate,
      alos,
      contributionPerNight: contributionPerNight(seed, { adr, otaRate, alos }, lastMonth),
      contributionTotal: nights * (contributionPerNight(seed, { adr, otaRate, alos }, lastMonth) || 0),
    };
  });
}

/** チャネル別の月次行（比較グラフ用） */
export function channelMonthlyRows(seed) {
  return seed.channelMonths.map((month) => {
    const row = { month };
    Object.keys(seed.channelMonthly).forEach((key) => {
      const c = seed.channelMonthly[key][month];
      if (!c) return;
      const adr = c.nights ? c.revenue / c.nights : 0;
      const otaRate = c.revenue ? c.otaFee / c.revenue : 0;
      const alos = c.bookings ? c.nights / c.bookings : 0;
      row[key] = {
        ...c,
        adr,
        otaRate,
        alos,
        contributionPerNight: contributionPerNight(seed, { adr, otaRate, alos }, month),
      };
    });
    return row;
  });
}

/** ごみ袋トレンド（袋数/滞在・袋数/泊） */
export function garbageTrend(seed) {
  return seed.garbageTrend.map((g) => ({
    ...g,
    bagsPerStay: g.cleanings ? g.bags / g.cleanings : 0,
    bagsPerNight: g.nights ? g.bags / g.nights : 0,
  }));
}
