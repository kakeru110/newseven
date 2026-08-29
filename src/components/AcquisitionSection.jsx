import React from "react";
import { Card, Legend } from "./ui.jsx";
import { yen, money, pct, num, monthLong } from "../lib/format.js";

/**
 * 集客ファネルと市場ポジション（CLAUDE.md §3-2 / §9-2 / §9-4）
 *
 * Airbnb・Booking.com とも閲覧数のAPIが無いため、管理画面から手入力した
 * seed.channelMetrics を表示する。予約件数・泊数は Beds24 実績と一致を確認済み。
 */

/** 転換率を帯で示す（幅＝率そのもの。件数の比で描くと最終段が消えるため） */
function FunnelStep({ from, to, rate, label }) {
  return (
    <div style={{ margin: "10px 0 14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}>
        <span style={{ color: "var(--text-2)" }}>{label}</span>
        <b style={{ fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>{pct(rate, 2)}</b>
      </div>
      <div style={{ height: 10, borderRadius: "0 4px 4px 0", background: "var(--series-1-wash)" }}>
        <div style={{ height: "100%", width: `${Math.min(rate * 100, 100)}%`, borderRadius: "0 4px 4px 0", background: "var(--series-1)" }} />
      </div>
      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
        {from.toLocaleString("ja-JP")} → {to.toLocaleString("ja-JP")}
      </div>
    </div>
  );
}

/** 自施設と競合を並べた対比バー（指標ごとに単位が違うため、各行を独立に正規化する） */
function VersusRow({ label, mine, rival, format, betterIsLower, neutral }) {
  const max = Math.max(mine, rival) || 1;
  const win = betterIsLower ? mine < rival : mine > rival;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
        <span>{label}</span>
        <span style={{ color: neutral ? "var(--muted)" : win ? "var(--up)" : "var(--neg)", fontWeight: 500 }}>
          {neutral ? "差" : win ? "優位" : "劣位"} {format(Math.abs(mine - rival))}
        </span>
      </div>
      {[
        { name: "自施設", v: mine, color: "var(--series-1)" },
        { name: "直接競合", v: rival, color: "var(--series-2)" },
      ].map((r) => (
        <div key={r.name} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <span style={{ fontSize: 11, color: "var(--muted)", width: 52, flex: "none" }}>{r.name}</span>
          <span style={{ flex: 1, height: 10, background: "var(--surface-2)", borderRadius: "0 4px 4px 0" }}>
            <span style={{ display: "block", height: "100%", width: `${(r.v / max) * 100}%`, background: r.color, borderRadius: "0 4px 4px 0" }} />
          </span>
          <b style={{ fontSize: 12, fontWeight: 500, fontVariantNumeric: "tabular-nums", width: 78, textAlign: "right" }}>{format(r.v)}</b>
        </div>
      ))}
    </div>
  );
}

export default function AcquisitionSection({ seed, channels }) {
  const cm = seed.channelMetrics;
  if (!cm) return null;
  const a = cm.airbnb;
  const b = cm.booking;
  const airbnbCh = channels.find((c) => c.key === "airbnb");
  const bookingCh = channels.find((c) => c.key === "booking");

  const inv = a.inventoryBreakdown;
  const viewToBooking = a.views ? a.checkIns / a.views : 0;
  /* 1閲覧あたり限界利益。期間が完全には一致しないため目安として扱う */
  const contributionPerNight = airbnbCh?.contributionPerNight || 0;
  const contributionTotal = contributionPerNight * a.nightsSold;
  const perView = a.views ? contributionTotal / a.views : 0;
  const adrGap = b.competitor.adr - b.adr;
  const bookingNights = Object.values(b.monthlyReported).reduce((s, m) => s + m.nights, 0);

  return (
    <div className="grid c2e">
      <Card
        title="集客ファネル（Airbnb）"
        note={`${monthLong(cm.period.from)}〜${monthLong(cm.period.to)}`}
        desc="閲覧数・インプレッションは API が無いため管理画面からの手入力です。予約件数と泊数は Beds24 実績と一致を確認済み。"
      >
        <FunnelStep label="検索インプレッション → ページ閲覧" from={a.impressions} to={a.views} rate={a.searchToViewRate} />
        <FunnelStep label="ページ閲覧 → 予約（実績ベース）" from={a.views} to={a.checkIns} rate={viewToBooking} />

        <div className="pill-row">
          <div className="pill">
            <div className="k">1閲覧あたり限界利益</div>
            <div className="v">{money(perView)} 円</div>
          </div>
          <div className="pill">
            <div className="k">検索1ページ目の表示率</div>
            <div className="v">{pct(a.impressionShareFirstPage, 1)}</div>
          </div>
          {inv && (
            <div className="pill">
              <div className="k">実際の空室</div>
              <div className="v">{inv.actuallyVacant} 泊</div>
            </div>
          )}
        </div>

        {inv && (
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table>
              <thead>
                <tr>
                  <th>期間 {inv.periodNights}泊の内訳</th>
                  <th className="num">泊数</th>
                  <th>Airbnb 上の扱い</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>Airbnb で売れた</td><td className="num">{inv.occupiedAirbnb}</td><td>予約獲得</td></tr>
                <tr><td>Booking.com で売れた</td><td className="num">{inv.occupiedBooking}</td><td>ブロック</td></tr>
                <tr className="grand">
                  <td>どこでも売れなかった</td>
                  <td className="num">{inv.actuallyVacant}</td>
                  <td>
                    出品していた {inv.airbnbListedButUnsold}泊 ／{" "}
                    <strong>出品していなかった {inv.airbnbBlockedAndUnsold}泊</strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <ul className="footnotes">
          {(!a.monthly || !Object.keys(a.monthly).length) && (
            <li>月次のインプレッション・閲覧数は未取得です（Airbnb 各画面右上の「月間レポート」から取得できます）。入れば月ごとの CVR を出せます。</li>
          )}
          {inv && (
            <li>
              Airbnb 画面の「空室 {a.vacantNights}泊」は<strong>販売可能だったのに埋まらなかった日数</strong>で、実際の空室ではありません。
              実際の空室は {inv.actuallyVacant}泊あり、うち <strong>{inv.airbnbBlockedAndUnsold}泊は Airbnb 上で販売不可</strong>のまま流れています
              （最低宿泊日数・在庫配分・手動ブロックが疑われます）。1泊あたり限界利益 {money(contributionPerNight)}円 で換算すると
              最大 {money(contributionPerNight * inv.airbnbBlockedAndUnsold)}円ぶんの販売機会にあたります。
            </li>
          )}
          <li>
            1閲覧あたり限界利益は、Airbnb の1泊あたり限界利益 {money(contributionPerNight)}円 × {a.nightsSold}泊 ÷ 閲覧 {a.views.toLocaleString("ja-JP")} で算出した目安です（集計期間が完全には一致しません）。
          </li>
          <li>Airbnb 表示の「閲覧からの成約率 {pct(a.reportedViewToBookingRate, 2)}」は月次平均の取り方が異なるため、実績から求めた {pct(viewToBooking, 2)} とは差があります。</li>
        </ul>
      </Card>

      <Card
        title="市場ポジション（Booking.com）"
        note={b.period.label}
        desc="エクストラネットが示す直接競合との比較。安く・短く・直前に売れている構図が数字で確認できます。"
      >
        <VersusRow label="平均客室単価（ADR）" mine={b.adr} rival={b.competitor.adr} format={(v) => `${money(v)}円`} />
        <VersusRow label="平均滞在泊数（ALOS）" mine={b.alos} rival={b.competitor.alos} format={(v) => `${num(v)}泊`} />
        <VersusRow label="予約リードタイム" mine={b.leadTimeDays} rival={b.competitor.leadTimeDays} format={(v) => `${num(v, 1)}日`} neutral />
        <VersusRow label="キャンセル率" mine={b.cancelRate} rival={b.competitor.cancelRate} format={(v) => pct(v, 1)} betterIsLower />

        <Legend items={[{ label: "自施設", color: "var(--series-1)" }, { label: "直接競合", color: "var(--series-2)" }]} />

        <ul className="footnotes">
          <li>
            単価差は <strong>{money(adrGap)}円/泊</strong>。この期間の Booking.com 販売 {bookingNights}泊に当てると
            約 {money(adrGap * bookingNights)}円 に相当します（競合と同水準まで上げられた場合の理論値）。
          </li>
          <li>
            平均滞在 {num(b.alos)}泊は競合 {num(b.competitor.alos)}泊より短く、清掃費が1滞在固定である以上、
            1泊あたりのコストがそのぶん高く付きます（CLAUDE.md §9-1）。
          </li>
          <li>
            キャンセル率は競合より良好です。リードタイムが短いこと自体は優劣を決められませんが、直前予約ほど単価が下がる傾向があるため注視する価値があります。{bookingCh ? `Booking.com の1泊あたり限界利益は ${money(bookingCh.contributionPerNight)}円。` : ""}
          </li>
        </ul>
      </Card>
    </div>
  );
}
