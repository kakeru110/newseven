/** 表示フォーマット（CLAUDE.md §12: 金額は日本円・整数・カンマ区切り。マイナスは括弧＋赤字） */

export const round = (n) => Math.round(n || 0);

/** 12,345 / マイナスは (12,345) */
export function money(n) {
  const v = round(n);
  const s = Math.abs(v).toLocaleString("ja-JP");
  return v < 0 ? `(${s})` : s;
}

/** ¥12,345 / マイナスは ¥(12,345) */
export function yen(n) {
  const v = round(n);
  return v < 0 ? `¥(${Math.abs(v).toLocaleString("ja-JP")})` : `¥${v.toLocaleString("ja-JP")}`;
}

/** 軸ラベル用の万単位表記 */
export function man(n) {
  const v = round(n);
  if (v === 0) return "0";
  return `${(v / 10000).toFixed(Math.abs(v) >= 100000 ? 0 : 1).replace(/\.0$/, "")}万`;
}

export function pct(v, digits = 1) {
  return `${((v || 0) * 100).toFixed(digits)}%`;
}

export function num(v, digits = 2) {
  return (v || 0).toFixed(digits);
}

/** "2026-08" → "8月" / "2026年8月" */
export const monthShort = (m) => `${Number(String(m).slice(5, 7))}月`;
export const monthLong = (m) => `${String(m).slice(0, 4)}年${Number(String(m).slice(5, 7))}月`;

/** 負値なら赤字クラスを返す */
export const signClass = (n) => (round(n) < 0 ? "neg" : "");
