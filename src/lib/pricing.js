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
