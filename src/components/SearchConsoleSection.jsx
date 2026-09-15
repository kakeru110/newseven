import React, { useMemo } from "react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from "recharts";
import { Card, ChartTooltip, axisProps } from "./ui.jsx";
import { pct, num } from "../lib/format.js";
import {
  weekly, coverage, relaunchComparison, funnel, bottleneck, rollup, slice, addDays,
} from "../lib/searchconsole.js";

/**
 * 直販ファネルの最上段（CLAUDE.md §3-5 / §9-2）
 *
 * Search Console の表示回数・クリックと、Beds24 の直販予約を繋いで
 * 「到達が少ないのか、到達はあるが予約に至らないのか」を切り分ける。
 *
 * グラフは表示回数とクリックで桁が2つ違うため、第2軸で重ねずに
 * 上下2枚に分ける（軸を2本持つグラフは読み手が比率を誤る）。
 */

const int = (n) => Math.round(n || 0).toLocaleString("ja-JP");
const mmdd = (d) => `${Number(String(d).slice(5, 7))}/${Number(String(d).slice(8, 10))}`;

const VERDICT = {
  site:     { label: "サイト側の改善", detail: "表示回数はほぼ変わらずクリック率が上がっています。露出ではなく、検索結果での見え方かサイトの中身が効いたと読めます。" },
  exposure: { label: "露出の増加",     detail: "表示回数そのものが増えています。サイトの改善というより、検索での露出が伸びた影響が大きいと読めます。" },
  both:     { label: "露出とサイトの両方", detail: "表示回数もクリック率も伸びています。どちらの寄与が大きいかはこの期間だけでは分けられません。" },
  flat:     { label: "有意な変化なし", detail: "前後で大きな差が出ていません。期間が短いか、効果が数字に出るほどではありません。" },
  insufficient: { label: "判定できない", detail: "比較できるだけの再構築前データがありません。" },
};

/** 未接続・権限エラーのときに出す設定手順。画面に出しておかないと着手できない */
function Setup({ state, siteUrl }) {
  const forbidden = state.status === "forbidden";
  return (
    <Card
      title="直販ファネル（Search Console）"
      note={forbidden ? "権限が足りません" : "未接続"}
      desc="直販サイトの表示回数・クリックを取り込むと、到達が少ないのか、到達はあるが予約に至らないのかを切り分けられます。"
    >
      <div className={`alert ${forbidden ? "bad" : ""}`}>
        {state.message || "GSC_SERVICE_ACCOUNT_KEY が未設定です。"}
      </div>
      <ol className="steps">
        <li>GCP でサービスアカウントを作り、JSON 鍵を発行する</li>
        <li>同じ GCP プロジェクトで <strong>Search Console API</strong> を有効化する</li>
        <li>Search Console → 設定 → ユーザーと権限 で、サービスアカウントのメールアドレス（<code>…iam.gserviceaccount.com</code>）を「制限付き」で追加する</li>
        <li>Vercel の Settings → Environment Variables に <code>GSC_SERVICE_ACCOUNT_KEY</code>（JSON そのまま、または Base64）を追加する</li>
        <li>対象が <code>{siteUrl}</code> 以外なら <code>GSC_SITE_URL</code> も設定する</li>
      </ol>
      <ul className="footnotes">
        <li>
          読み取り専用のスコープ（<code>webmasters.readonly</code>）だけで動きます。鍵はサーバー側の関数だけが持ち、ブラウザには渡りません。
        </li>
        <li>
          freee と違い <strong>リフレッシュトークンのローテーションが要りません</strong>。JWT を自己署名してアクセストークンを取るだけなので、連携が数日で切れる問題（CLAUDE.md §3-3）を構造的に踏みません。
        </li>
        <li>
          <strong>接続したら最初に収録開始日を確認します。</strong> サイト再構築（{seedRelaunch()}）より前まで遡れるなら、旧サイトとの前後比較が取れます。
        </li>
      </ul>
    </Card>
  );
  function seedRelaunch() { return state.relaunchedOn || "2026年8月下旬"; }
}

/** 1系列の小さな面グラフ。表示回数とクリックを別々に描くために使う */
function MiniArea({ rows, dataKey, name, color, wash, relaunchWeek, format }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 4 }}>{name}</div>
      <ResponsiveContainer width="100%" height={130}>
        <AreaChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="weekStart" tickFormatter={mmdd} interval="preserveStartEnd" minTickGap={28} {...axisProps} />
          <YAxis width={44} tickFormatter={(v) => int(v)} {...axisProps} />
          {relaunchWeek && (
            <ReferenceLine
              x={relaunchWeek}
              stroke="var(--muted)"
              strokeDasharray="3 3"
              label={{ value: "サイト再構築", position: "insideTopLeft", fill: "var(--muted)", fontSize: 10 }}
            />
          )}
          <Tooltip
            cursor={{ stroke: "var(--muted)", strokeWidth: 1 }}
            content={(p) => (
              <ChartTooltip
                {...p}
                label={p.label ? `${mmdd(p.label)} の週` : ""}
                rows={(pl) => [[name, format(pl[0]?.value)]]}
              />
            )}
          />
          <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} fill={wash} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function SearchConsoleSection({ seed, live, gsc }) {
  const site = seed.directSite;
  const relaunchedOn = site?.relaunchedOn || null;

  const view = useMemo(() => {
    if (gsc.status !== "ok") return null;
    const daily = gsc.data.daily || [];
    const cov = coverage(daily, relaunchedOn);
    if (cov.empty) return { cov, empty: true };

    const weeks = weekly(daily, { weeks: 26 });
    const relaunchWeek = relaunchedOn
      ? weeks.find((w) => w.weekEnd >= relaunchedOn && w.weekStart <= relaunchedOn)?.weekStart || null
      : null;

    const bookings = live.status === "ok" ? live.data.bookings : [];
    const since = relaunchedOn && relaunchedOn > cov.startsAt ? relaunchedOn : cov.startsAt;
    const f = funnel(seed, daily, bookings, { from: since, to: cov.endsAt });
    const last28 = rollup(slice(daily, addDays(cov.endsAt, -27), cov.endsAt));

    return {
      cov, weeks, relaunchWeek, f, last28,
      cmp: relaunchComparison(daily, relaunchedOn, cov.endsAt),
      bn: bottleneck(f),
      devices: gsc.data.devices || [],
      queries: (gsc.data.queries || []).slice(0, 8),
    };
  }, [gsc, live, seed, relaunchedOn]);

  if (gsc.status === "loading") {
    return <Card title="直販ファネル（Search Console）" note="取得中"><p className="desc">検索パフォーマンスを読み込んでいます。</p></Card>;
  }
  if (gsc.status === "unconfigured" || gsc.status === "forbidden") {
    return <Setup state={{ ...gsc, relaunchedOn }} siteUrl={site?.url || "https://kamakuragateinn.com/"} />;
  }
  if (gsc.status === "error") {
    return (
      <Card title="直販ファネル（Search Console）" note="取得に失敗">
        <div className="alert bad">{gsc.message}</div>
      </Card>
    );
  }
  if (!view || view.empty) {
    return (
      <Card title="直販ファネル（Search Console）" note="データなし">
        <div className="alert">このプロパティにはまだ検索データがありません。登録直後の場合、数日待つと入り始めます。</div>
      </Card>
    );
  }

  const { cov, weeks, relaunchWeek, f, last28, cmp, bn, devices, queries } = view;

  return (
    <div className="grid c2e">
      <Card
        title="直販ファネル（Search Console）"
        note={f.from === cov.startsAt ? `${f.from} 〜 ${f.to}` : `再構築後 ${f.from} 〜 ${f.to}`}
        desc={`Google 自然検索での表示回数・クリックと、直販予約（テスト予約を除く）を繋いだものです。${
          f.from === cov.startsAt ? "" : `集計は再構築（${relaunchedOn}）以降に限っています。旧サイトの数字を混ぜると新サイトの評価にならないためです。`
        }`}
      >
        <div className="pill-row">
          <div className="pill"><div className="k">表示回数</div><div className="v">{int(f.impressions)}</div></div>
          <div className="pill"><div className="k">クリック</div><div className="v">{int(f.clicks)}</div></div>
          <div className="pill"><div className="k">直販予約</div><div className="v">{int(f.bookings)} 件</div></div>
          <div className="pill"><div className="k">平均掲載順位</div><div className="v">{num(f.position, 1)} 位</div></div>
        </div>

        <MiniArea rows={weeks} dataKey="impressions" name="表示回数（週合計）"
          color="var(--series-1)" wash="var(--series-1-wash)" relaunchWeek={relaunchWeek} format={int} />
        <MiniArea rows={weeks} dataKey="clicks" name="クリック（週合計）"
          color="var(--series-2)" wash="var(--series-2-wash)" relaunchWeek={relaunchWeek} format={int} />

        <div className={`alert ${bn.key === "reach" ? "" : bn.key === "conversion" ? "bad" : ""}`}>
          <strong>{bn.label}</strong> — {bn.detail}
          {bn.needsGa4
            ? " → GA4 を入れる段階です。"
            : " → GA4 はまだ不要です（母数が足りず、入れても判断できません）。"}
        </div>

        <ul className="footnotes">
          <li>
            <strong>クリック数は訪問数の下限です。</strong> Google 自然検索だけを数えており、直接入力・他サイトからのリンク・他の検索エンジンは含まれません。したがって成約率 {pct(f.clickToBooking, 2)} は実態より高めに出ます。
          </li>
          <li>
            直販予約は<strong>予約日</strong>で数えています（宿泊日ではありません）。検索で来た人がその場で予約する流れに合わせるためです。テスト予約 {(seed.testBookings?.ids || []).length}件は除外しています。
            {f.bookingsCancelled > 0 && ` うち ${f.bookingsCancelled}件はその後キャンセルされています。`}
          </li>
          <li>Search Console の反映は2〜3日遅れます。確定値のみを取得しているため、直近の数日はまだ出てきません。</li>
          <li>参考までに<strong>直近28日</strong>（上の集計窓とは別）は 表示 {int(last28.impressions)} ・ クリック {int(last28.clicks)} ・ CTR {pct(last28.ctr, 2)} ・ 平均 {num(last28.position, 1)}位。収録全体は {cov.startsAt}〜{cov.endsAt} の {cov.days}日ぶんです。</li>
        </ul>
      </Card>

      <Card
        title="サイト再構築の前後"
        note={relaunchedOn ? `${relaunchedOn} を境に比較` : "再構築日が未設定"}
        desc="予約が入るようになったのは、サイトが良くなったからか、検索での露出が増えたからかを切り分けます。"
      >
        {!cmp || !cmp.available ? (
          <>
            <div className="alert">
              <strong>前後比較はできません。</strong>{" "}
              {cov.startsAt >= (relaunchedOn || "")
                ? `Search Console の収録が ${cov.startsAt} からで、再構築（${relaunchedOn}）より後です。プロパティ登録より前は遡れないため、旧サイトのデータは存在しません。`
                : `再構築前のデータが ${cov.beforeDays}日ぶんしかありません。季節変動と区別できないため、最低2週間は必要です。`}
            </div>
            <ul className="footnotes">
              <li>これから先の比較材料にはなります。日次データは蓄積されるので、次の判断（10月上旬）では使えます。</li>
            </ul>
          </>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>指標</th>
                    <th className="num">再構築前<br />{mmdd(cmp.before.from)}〜{mmdd(cmp.before.to)}</th>
                    <th className="num">再構築後<br />{mmdd(cmp.after.from)}〜{mmdd(cmp.after.to)}</th>
                    <th className="num">変化</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>表示回数</td><td className="num">{int(cmp.before.impressions)}</td>
                    <td className="num">{int(cmp.after.impressions)}</td>
                    <td className={`num ${cmp.change.impressions < 0 ? "neg" : ""}`}>{pct(cmp.change.impressions, 1)}</td>
                  </tr>
                  <tr>
                    <td>クリック</td><td className="num">{int(cmp.before.clicks)}</td>
                    <td className="num">{int(cmp.after.clicks)}</td>
                    <td className={`num ${cmp.change.clicks < 0 ? "neg" : ""}`}>{pct(cmp.change.clicks, 1)}</td>
                  </tr>
                  <tr>
                    <td>CTR</td><td className="num">{pct(cmp.before.ctr, 2)}</td>
                    <td className="num">{pct(cmp.after.ctr, 2)}</td>
                    <td className={`num ${cmp.change.ctr < 0 ? "neg" : ""}`}>{pct(cmp.change.ctr, 1)}</td>
                  </tr>
                  <tr>
                    <td>平均掲載順位</td><td className="num">{num(cmp.before.position, 1)}</td>
                    <td className="num">{num(cmp.after.position, 1)}</td>
                    <td className={`num ${cmp.change.position < 0 ? "neg" : ""}`}>{pct(cmp.change.position, 1)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="alert" style={{ marginTop: 12 }}>
              <strong>{VERDICT[cmp.verdict].label}</strong> — {VERDICT[cmp.verdict].detail}
            </div>

            <ul className="footnotes">
              <li>窓の長さを {cmp.span}日 で揃えています。揃えないと、長いほうの合計が大きく出るだけになります。</li>
              <li>掲載順位は小さいほど良いため、変化率は「改善率」として符号を反転しています。</li>
              <li>季節性は補正していません。宿泊需要には季節があるので、前後で需要そのものが違う可能性は残ります。</li>
            </ul>
          </>
        )}

        {devices.length > 0 && (
          <>
            <h3 className="sub-h">デバイス別（直近{gsc.data.recentWindow?.days ?? 90}日）</h3>
            <div className="table-wrap">
              <table>
                <thead><tr><th>デバイス</th><th className="num">表示</th><th className="num">クリック</th><th className="num">CTR</th></tr></thead>
                <tbody>
                  {devices.map((d) => (
                    <tr key={d.device}>
                      <td>{{ MOBILE: "モバイル", DESKTOP: "パソコン", TABLET: "タブレット" }[d.device] || d.device}</td>
                      <td className="num">{int(d.impressions)}</td>
                      <td className="num">{int(d.clicks)}</td>
                      <td className="num">{pct(d.impressions ? d.clicks / d.impressions : 0, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {queries.length > 0 && (
          <>
            <h3 className="sub-h">検索語（直近{gsc.data.recentWindow?.days ?? 90}日・上位{queries.length}件）</h3>
            <div className="table-wrap">
              <table>
                <thead><tr><th>検索語</th><th className="num">表示</th><th className="num">クリック</th><th className="num">順位</th></tr></thead>
                <tbody>
                  {queries.map((q) => (
                    <tr key={q.query}>
                      <td>{q.query}</td>
                      <td className="num">{int(q.impressions)}</td>
                      <td className="num">{int(q.clicks)}</td>
                      <td className="num">{num(q.position, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="footnotes">
              <li>表示回数の少ない検索語は匿名化されて行に出ません。この表の合計は上の合計と一致しません。</li>
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}
