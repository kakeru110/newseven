import React, { useMemo } from "react";
import { ComposedChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, Legend, ChartTooltip, axisProps } from "./ui.jsx";
import { yen, money, num, pct, monthShort, monthLong, signClass } from "../lib/format.js";
import { monthlyForecast, paceBenchmark, daysInMonth } from "../lib/forecast.js";
import { consumption, fiscalYear } from "../lib/regulation.js";

const pad = (n) => String(n).padStart(2, "0");
const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const addMonths = (month, n) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

const VERDICT = {
  ahead:   { label: "先行",     cls: "ok" },
  onTrack: { label: "並み",     cls: "" },
  soft:    { label: "やや遅れ",  cls: "warn" },
  behind:  { label: "遅れ",     cls: "bad" },
  current: { label: "進行中",    cls: "" },
  unknown: { label: "—",       cls: "" },
};

/**
 * 先行き（オン・ザ・ブックス）— CLAUDE.md §9-6
 *
 * 将来月は収支表PDFが存在しないので、Beds24 の予約データだけが情報源になる。
 * 「今いくら入っていて、このままだと損益はどうなるか」「過去の同じ時期と比べて
 * 速いのか遅いのか」を出し、値下げ・値上げの判断材料にする。
 *
 * ただし判断の前に 180日規制の残り枠を見ること。枠が無ければ、
 * 空室がいくらあっても売れないので価格の議論に意味がない。
 */
export default function ForecastSection({ seed, live: state, alos }) {
  const today = isoToday();
  const view = useMemo(() => {
    if (state.status !== "ok") return null;
    const bookings = state.data.bookings;
    const fy = fiscalYear(today, seed.regulation?.fiscalYearStartMonth || 4);
    const quota = consumption(bookings, { today, fy, limit: seed.regulation?.limitNights || 180 });

    const start = today.slice(0, 7);
    const months = [0, 1, 2, 3, 4].map((i) => addMonths(start, i));
    /* 規制の残り枠は年度で1本。どの月も「これ以上は受けられない」上限として効く */
    const quotaByMonth = Object.fromEntries(months.map((m) => [m, m <= fy.end.slice(0, 7) ? quota.remaining : null]));
    const rows = monthlyForecast(seed, bookings, { months, asOf: today, assumedAlos: alos, quotaByMonth });

    /* 比較対象は実績のある過去月だけ。立ち上げ期（§9-4）は価格戦略が違うので外す */
    const launch = new Set(seed.pricingContext?.launchMonths || []);
    const history = seed.monthly.map((m) => m.month).filter((m) => !launch.has(m)).concat(start).filter((m, i, a) => a.indexOf(m) === i);
    const pace = Object.fromEntries(months.map((m) => [m, paceBenchmark(bookings, { month: m, asOf: today, history })]));

    return { rows, pace, quota, fy, months };
  }, [state, seed, alos, today]);

  if (!view) return null;
  const { rows, pace, quota, fy } = view;

  const totals = rows.reduce(
    (a, r) => ({ revenue: a.revenue + r.revenue, cm: a.cm + r.contributionMargin, op: a.op + r.operatingProfit, nights: a.nights + r.nights }),
    { revenue: 0, cm: 0, op: 0, nights: 0 }
  );

  const chartData = rows.map((r) => {
    const p = pace[r.month];
    const expected = p?.landing ? Math.max(0, p.landing.mid - r.nights) : 0;
    return {
      month: r.month,
      label: monthShort(r.month),
      booked: r.nights,
      expected,
      /* 規制枠を超える分は、売ろうとしても法的に受けられない */
      blocked: Math.max(0, expected - r.sellableDays),
      sellable: r.sellableDays,
      calendarDays: r.calendarDays,
      occupancy: r.occupancy,
      revenue: r.revenue,
      operatingProfit: r.operatingProfit,
    };
  });

  const capped = quota.remaining <= 0;

  return (
    <Card
      title="先行き（予約済み）"
      note={`${monthLong(rows[0].month)}以降 ・ ${new Date(state.data.fetchedAt).toLocaleDateString("ja-JP")} 時点`}
      desc="将来月は収支表PDFが存在しないので、Beds24 の予約データだけで組み立てています。OTA手数料は実額、清掃・光熱・日用品・運営サポート料は単価マスタからの推計です。グラフの縦軸は泊数（満室は30〜31泊）。"
    >
      {capped ? (
        <p className="alert bad">
          <b>住宅宿泊事業法の年間180日を、確定済みの予約だけで使い切っています（残り {quota.remaining} 日）。</b>
          　この状態では空室が何日あっても新規予約は受けられません。価格を下げて埋める判断より先に、
          旅館業の許可取得か、カレンダーを閉じる対応が要ります（§9-5）。
        </p>
      ) : (
        <p className="alert">
          {fy.label}の残り枠は <b>{quota.remaining}日</b>。下表の「販売可能」はこの枠と暦の空きの小さいほうです。
        </p>
      )}

      <div className="grid kpi" style={{ marginBottom: 12 }}>
        {[
          { label: "予約済み売上（5ヶ月）", value: yen(totals.revenue), sub: `${totals.nights} 泊ぶん` },
          { label: "予約済み 限界利益", value: yen(totals.cm), sub: `固定費 ${money(rows[0].fixedCost)}円/月` },
          { label: "予約済み 営業損益", value: yen(totals.op), sub: "この先の予約が積み上がる前の値" },
          { label: `180日の残り枠（${fy.label}）`, value: `${quota.remaining} 日`, sub: `実績 ${quota.stayed}日 ／ 予約済み ${quota.booked}日` },
        ].map((t) => (
          <div className="card kpi-card" key={t.label} style={{ boxShadow: "none", background: "var(--surface-2)" }}>
            <div className="label">{t.label}</div>
            <div className={`value ${t.label.includes("損益") ? signClass(totals.op) : ""}`}>{t.value}</div>
            <div className="sub">{t.sub}</div>
          </div>
        ))}
      </div>

      <div className="chart">
        <ResponsiveContainer width="100%" height={236}>
          <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
            <defs>
              <pattern id="fc-expected" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="6" height="6" fill="var(--series-1-wash)" />
                <rect width="2.5" height="6" fill="var(--series-1)" />
              </pattern>
              <pattern id="fc-blocked" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(135)">
                <rect width="6" height="6" fill="var(--surface-2)" />
                <rect width="2.5" height="6" fill="var(--muted)" />
              </pattern>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis {...axisProps} width={36} tickFormatter={(v) => `${v}`} domain={[0, 31]} ticks={[0, 8, 16, 24, 31]} />
            <Tooltip
              cursor={{ fill: "var(--surface-2)" }}
              content={(p) => (
                <ChartTooltip
                  {...p}
                  label={monthLong(p.payload?.[0]?.payload?.month || "")}
                  rows={(pl) => {
                    const d = pl[0].payload;
                    const out = [
                      ["予約済み", `${d.booked} 泊（稼働 ${pct(d.occupancy)}）`],
                      ["予約済み売上", `${money(Math.round(d.revenue))} 円`],
                      ["営業損益（現時点）", `${money(Math.round(d.operatingProfit))} 円`],
                      ["見込み追加", `${num(d.expected, 0)} 泊`],
                    ];
                    if (d.blocked > 0) out.push(["うち規制で受けられない", `${num(d.blocked, 0)} 泊`]);
                    return out;
                  }}
                />
              )}
            />
            <Bar dataKey="booked" stackId="n" fill="var(--series-1)" isAnimationActive={false} />
            <Bar dataKey="expected" stackId="n" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {chartData.map((d) => (
                <Cell key={d.month} fill={d.blocked > 0 ? "url(#fc-blocked)" : "url(#fc-expected)"} />
              ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <Legend
        items={[
          { label: "予約済み（確定）", color: "var(--series-1)" },
          {
            label: capped
              ? "見込み追加（過去の同時期の積み上がり）※ 今は180日規制で受けられない"
              : "見込み追加（過去の同時期の積み上がり）",
            type: "hatch",
          },
        ]}
      />

      <div className="table-wrap">
        <table className="sticky-first">
          <thead>
            <tr>
              <th>月</th>
              <th>予約済み</th>
              <th>稼働</th>
              <th>売上</th>
              <th>限界利益</th>
              <th>営業損益</th>
              <th>分岐まで</th>
              <th>追加1泊の利益</th>
              <th>ペース</th>
              <th>販売可能</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const p = pace[r.month];
              const v = VERDICT[p?.verdict || "unknown"];
              return (
                <tr key={r.month}>
                  <td>{monthLong(r.month)}</td>
                  <td>{r.nights} 泊</td>
                  <td>{pct(r.occupancy)}</td>
                  <td>{money(Math.round(r.revenue))}</td>
                  <td>{money(Math.round(r.contributionMargin))}</td>
                  <td className={signClass(r.operatingProfit)}>{money(Math.round(r.operatingProfit))}</td>
                  <td>{r.nightsToBreakEven > 0 ? `あと ${num(r.nightsToBreakEven, 1)} 泊` : "達成"}</td>
                  <td>{r.marginalPerNight > 0 ? `${money(Math.round(r.marginalPerNight))}` : "—"}</td>
                  <td className={v.cls}>
                    {v.label}
                    {p?.benchmark && p.leadDays > 0 && (
                      <span className="psub"> 過去 {p.benchmark.min}〜{p.benchmark.max}泊</span>
                    )}
                  </td>
                  <td className={r.sellableDays === 0 ? "bad" : ""}>{r.sellableDays} 日</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="footnotes">
        <li>
          <b>「分岐まで」</b>は、その月の営業損益が0になるまでにあと何泊売る必要があるかです。
          追加1泊の限界利益は、これから入る予約が平均宿泊日数 {num(alos, 2)}泊で入る前提で計算しています
          （長期予約1件で月のALOSが伸びると判断が歪むため、月の実測ALOSは使いません）。
        </li>
        <li>
          <b>「ペース」</b>は、今と同じリードタイム（対象月の初日まで {rows.map((r) => pace[r.month]?.leadDays).filter((v) => v > 0).join("・")}日など）に
          過去の各月が何泊入っていたかと比べたものです。
          <b>同じ月の前年実績がまだ無いため季節性は補正していません。</b>サンプルも{rows.map((r) => pace[r.month]).find((p) => p?.leadDays > 0)?.benchmark?.count ?? 0}ヶ月しかないので、
          断定ではなく目安として読んでください。
        </li>
        <li>
          値下げを考える前に「販売可能」を見てください。180日の枠が残っていない月は、
          価格をいくら下げても予約を受けられません。逆に枠が希少なら、下げるのではなく
          <b>上げる</b>のが正しい方向になります。
        </li>
        <li>
          売上の月配分は<b>宿泊日が属する月</b>です。月次P/L（収支表由来）はチェックアウト月に計上するため、
          月をまたぐ滞在の扱いが違います（CLAUDE.md §6-2）。
        </li>
      </ul>
    </Card>
  );
}
