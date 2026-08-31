import React, { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { Card, ChartTooltip, axisProps } from "./ui.jsx";
import { num, monthShort, monthLong } from "../lib/format.js";
import { fiscalYear, consumption, project, recentPace } from "../lib/regulation.js";

/**
 * 住宅宿泊事業法の年間営業日数（180日）カウンター
 *
 * 上限に達すると、その年度はもう営業できない。予約が入るたびに到達予測日が動くため、
 * 旅館業の許可取得が間に合うかを常時見張る目的で置いている。
 */
const PACES = [20, 22, 24, 26, 28];

export default function RegulationCounter({ seed, live }) {
  const cfg = seed.regulation || { limit: 180, warnRemaining: 30 };
  const today = new Date().toISOString().slice(0, 10);
  const fy = fiscalYear(today);

  const result = useMemo(() => {
    if (live.status !== "ok") return null;
    const bookings = live.data.bookings;
    const c = consumption(bookings, { today, fy, limit: cfg.limit });
    const pace = recentPace(c.months, today, 3);
    const main = project(bookings, { today, fy, limit: cfg.limit, pace: Math.round(pace) || 1 });
    const alts = PACES.map((p) => ({ pace: p, ...project(bookings, { today, fy, limit: cfg.limit, pace: p }) }));
    return { c, pace, main, alts };
  }, [live, seed]);

  if (live.status !== "ok") {
    return (
      <Card title={`営業日数の上限（${cfg.limit}日 / 年）`} note={live.status === "loading" ? "取得中" : "未接続"}>
        <p className="desc" style={{ marginBottom: 0 }}>
          Beds24 の予約データから計算します。{live.status === "error" && `（${live.message}）`}
        </p>
      </Card>
    );
  }

  const { c, pace, main, alts } = result;
  const used = c.total / cfg.limit;
  const warn = c.remaining <= (cfg.warnRemaining ?? 30);
  const meterColor = c.remaining <= 0 ? "var(--critical)" : warn ? "var(--warning)" : "var(--series-1)";

  const chart = main.series.map((s) => ({
    ...s,
    label: monthShort(s.month),
    past: s.isPast ? s.cumulative : null,
    future: s.isPast ? s.cumulative : s.cumulative,
  }));

  return (
    <Card
      title={`営業日数の上限（${cfg.limit}日 / 年）`}
      note={`${fy.start} 〜 ${fy.end}`}
      desc="住宅宿泊事業法の年間営業日数。1泊を1日として数えています。上限に達すると、その年度はもう営業できません。"
    >
      <div className="grid kpi" style={{ marginBottom: 14 }}>
        <div className="card tile lead" style={{ boxShadow: "none", background: "var(--surface-2)" }}>
          <div className="label">消化した日数</div>
          <div className="value" style={{ color: c.remaining <= 0 ? "var(--neg)" : undefined }}>
            {c.total} <span style={{ fontSize: 20, color: "var(--text-2)" }}>/ {cfg.limit}日</span>
          </div>
          <div className="meter">
            <div className="meter-track">
              <div className="meter-fill" style={{ width: `${Math.min(used * 100, 100)}%`, background: meterColor }} />
            </div>
            <div className="meter-cap">
              <span>実績 {c.stayed}日 ・ 予約 {c.booked}日</span>
              <span style={{ fontWeight: 500, color: c.remaining <= 0 ? "var(--neg)" : "var(--text-2)" }}>残り {c.remaining}日</span>
            </div>
          </div>
        </div>
        <div className="card tile" style={{ boxShadow: "none", background: "var(--surface-2)" }}>
          <div className="label">直近3ヶ月の実績ペース</div>
          <div className="value">{num(pace, 1)} <span style={{ fontSize: 15, color: "var(--text-2)" }}>泊/月</span></div>
        </div>
        <div className="card tile" style={{ boxShadow: "none", background: warn ? "var(--series-2-wash)" : "var(--surface-2)" }}>
          <div className="label">{cfg.limit}泊目を迎える日（このペースで）</div>
          <div className="value" style={{ fontSize: 22 }}>{main.reachDate ? monthLong(main.reachDate) + main.reachDate.slice(8).replace(/^0/, "") + "日" : "年度内に到達せず"}</div>
          <div className="sub">この日までに旅館業の許可が要ります</div>
        </div>
        <div className="card tile" style={{ boxShadow: "none", background: "var(--surface-2)" }}>
          <div className="label">年度末までの見込み</div>
          <div className="value">{main.totalAtYearEnd} <span style={{ fontSize: 15, color: "var(--text-2)" }}>泊</span></div>
          <div className="sub">上限との差 {main.totalAtYearEnd - cfg.limit > 0 ? `+${main.totalAtYearEnd - cfg.limit}泊` : "上限内"}</div>
        </div>
      </div>

      <div className="chart">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chart} margin={{ top: 8, right: 72, left: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis {...axisProps} width={44} />
            <ReferenceLine y={cfg.limit} stroke="var(--critical)" label={{ value: `上限 ${cfg.limit}日`, position: "right", fill: "var(--critical)", fontSize: 10 }} />
            <Tooltip
              content={(p) => (
                <ChartTooltip
                  {...p}
                  label={monthLong(p.payload?.[0]?.payload?.month || "")}
                  rows={(pl) => [["累計", `${pl[0].payload.cumulative} 泊`], ["区分", pl[0].payload.isPast ? "実績" : "見込み"]]}
                />
              )}
            />
            <Line dataKey="future" stroke="var(--series-1)" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
            <Line dataKey="past" stroke="var(--series-1)" strokeWidth={2}
                  dot={{ r: 3, fill: "var(--series-1)", stroke: "var(--surface)", strokeWidth: 2 }} connectNulls={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="table-wrap" style={{ marginTop: 14 }}>
        <table>
          <thead>
            <tr>
              <th>今後のペース</th>
              <th>{cfg.limit}泊目を迎える日</th>
              <th className="num">年度末までの合計</th>
              <th className="num">上限との差</th>
            </tr>
          </thead>
          <tbody>
            {alts.map((a) => (
              <tr key={a.pace} className={Math.round(pace) === a.pace ? "grand" : ""}>
                <td>{a.pace} 泊/月{Math.round(pace) === a.pace ? "（直近の実績）" : ""}</td>
                <td>{a.reachDate || "到達せず"}</td>
                <td>{a.totalAtYearEnd} 泊</td>
                <td className={a.totalAtYearEnd > cfg.limit ? "neg" : ""}>
                  {a.totalAtYearEnd > cfg.limit ? `+${a.totalAtYearEnd - cfg.limit}` : a.totalAtYearEnd - cfg.limit} 泊
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="footnotes">
        <li>
          カウント期間は毎年4月1日正午から翌年4月1日正午まで。ここでは日付単位で扱っているため、
          境界日の解釈で±1日ずれる可能性があります。<strong>自治体への定期報告の値と突き合わせて確認してください。</strong>
        </li>
        <li>キャンセルは除いて数えています。将来分の予約がキャンセルされれば、到達日はその分だけ後ろにずれます。</li>
        <li>予測は、既に入っている予約に加えて、空き日が想定ペースで埋まると仮定したものです。</li>
      </ul>
    </Card>
  );
}
