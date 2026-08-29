/**
 * 値上げシミュレーション（CLAUDE.md §9-1 / §9-4）
 *
 * 「単価を上げて稼働が落ちても利益は増えるのか」を判断するための計算。
 *
 * 実績を基準点とし、そこからの**差分**だけを単価マスタ（costRates）で計算する。
 * モデルで金額を一から組み立てると、清掃の立替控除や光熱費の実額との差が
 * 基準点の時点でズレてしまうため、ズレが相殺される差分方式をとる。
 */
import { ratesFor } from "./metrics.js";

/** 実績（期間通算）を1ヶ月あたりに均した基準点 */
export function baseline(seed, totals) {
  const months = totals.months || 1;
  const revenue = totals.revenue / months;
  const nights = totals.nightsActual / months;
  const cleanings = totals.cleaningCount / months;
  return {
    calendarDays: totals.calendarDays / months,
    nights,
    cleanings,
    revenue,
    /** 1泊あたり売上。ADR（売上÷売上計上泊数）とは分母が違う点に注意 */
    perNight: nights ? revenue / nights : 0,
    occupancy: totals.occupancyRate,
    alos: totals.alos,
    otaRate: revenue ? totals.variableCostTotal && totals.otaFee != null ? totals.otaFee / totals.revenue : 0 : 0,
    contributionMargin: totals.contributionMargin / months,
    fixedCost: totals.fixedCostTotal / months,
    operatingProfit: totals.operatingProfit / months,
  };
}

/** モデル上の限界利益（差分をとるためだけに使う。絶対値は実績と一致しない） */
function modelContribution(rates, { nights, cleanings, revenue, otaRate }) {
  const otaFee = revenue * otaRate;
  const support = revenue * rates.mgmtSupportRate * rates.taxMultiplier;
  const cleaning = cleanings * rates.cleaningPerStay;
  const perNightCost = nights * (rates.utilitiesPerNight + rates.suppliesPerNight);
  return revenue - otaFee - support - cleaning - perNightCost;
}

/**
 * 単価を priceMultiplier 倍、稼働率を occupancyDelta（ポイント）動かしたときの月次見込み。
 * 泊数あたりの滞在数（ALOS）は据え置き。
 */
export function simulate(seed, base, { priceMultiplier = 1, occupancyDelta = 0, alos = null, month }) {
  const rates = ratesFor(seed, month);
  const useAlos = alos || base.alos;

  const occupancy = Math.max(0, Math.min(1, base.occupancy + occupancyDelta));
  const nights = base.calendarDays * occupancy;
  const cleanings = useAlos ? nights / useAlos : 0;
  const perNight = base.perNight * priceMultiplier;
  const revenue = nights * perNight;

  const now = modelContribution(rates, { nights, cleanings, revenue, otaRate: base.otaRate });
  const ref = modelContribution(rates, {
    nights: base.nights,
    cleanings: base.cleanings,
    revenue: base.revenue,
    otaRate: base.otaRate,
  });

  const contributionMargin = base.contributionMargin + (now - ref);
  const operatingProfit = contributionMargin - base.fixedCost;

  return {
    occupancy,
    nights,
    cleanings,
    perNight,
    revenue,
    contributionMargin,
    contributionMarginRate: revenue ? contributionMargin / revenue : 0,
    operatingProfit,
    deltaOperatingProfit: operatingProfit - base.operatingProfit,
    deltaRevenue: revenue - base.revenue,
  };
}

/** 単価を上げたとき、営業損益を維持できる稼働率の下限（＝許容できる稼働の落ち幅） */
export function breakEvenOccupancyDelta(seed, base, priceMultiplier, month) {
  let lo = -base.occupancy, hi = 1 - base.occupancy;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const r = simulate(seed, base, { priceMultiplier, occupancyDelta: mid, month });
    if (r.operatingProfit < base.operatingProfit) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * 月別の値上げ推奨（CLAUDE.md §9-4）
 *
 * 稼働率で機械的に区分する。ただし立ち上げ期（レビュー獲得のために意図的に
 * 単価を下げていた期間）は、低単価が戦略なので判断から除外する。
 */
export function priceRecommendations(seed, months) {
  const ctx = seed.pricingContext || {};
  const t = ctx.thresholds || {};
  const launch = new Set(ctx.launchMonths || []);
  const high = t.highOccupancy ?? 0.88;
  const mid = t.midOccupancy ?? 0.7;

  return months.map((m) => {
    const perNight = m.nightsActual ? m.revenueTotal / m.nightsActual : 0;
    const row = {
      month: m.month,
      occupancy: m.occupancyRate,
      perNight,
      operatingProfit: m.operatingProfit,
      isLaunch: launch.has(m.month),
      isProvisional: m.isProvisional,
    };
    if (row.isLaunch) return { ...row, band: "launch", increase: 0 };

    const increase = m.occupancyRate >= high ? (t.highIncrease ?? 0.15)
      : m.occupancyRate >= mid ? (t.midIncrease ?? 0.10)
      : 0;
    if (!increase) return { ...row, band: "hold", increase: 0 };

    const base = {
      calendarDays: m.calendarDays,
      nights: m.nightsActual,
      cleanings: m.cleaningCount,
      revenue: m.revenueTotal,
      perNight,
      occupancy: m.occupancyRate,
      alos: m.alos,
      otaRate: m.revenueTotal ? m.variableCosts.otaFee / m.revenueTotal : 0,
      contributionMargin: m.contributionMargin,
      fixedCost: m.fixedCostTotal,
      operatingProfit: m.operatingProfit,
    };
    const tolerance = breakEvenOccupancyDelta(seed, base, 1 + increase, m.month);
    const flat = simulate(seed, base, { priceMultiplier: 1 + increase, occupancyDelta: 0, month: m.month });
    const halfDrop = simulate(seed, base, { priceMultiplier: 1 + increase, occupancyDelta: tolerance / 2, month: m.month });
    return {
      ...row,
      band: m.occupancyRate >= high ? "high" : "mid",
      increase,
      tolerance,
      gainIfFlat: flat.deltaOperatingProfit,
      gainIfHalfDrop: halfDrop.operatingProfit - m.operatingProfit,
      suggestedPerNight: perNight * (1 + increase),
    };
  });
}
