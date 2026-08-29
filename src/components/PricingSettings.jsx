import React from "react";
import { Card } from "./ui.jsx";
import { money, pct, num } from "../lib/format.js";

/**
 * PriceLabs の価格設定と変更履歴（CLAUDE.md §9-4）
 *
 * PriceLabs は API 未接続のため、設定値は画面からの手入力。
 * 変更履歴を残しておかないと、あとから効果を測るときに
 * 「いつ何を変えたか」が分からなくなる。
 */
const LABEL = { minPrice: "最低価格", basePrice: "基準価格", maxPrice: "最高価格" };

export default function PricingSettings({ seed }) {
  const s = seed.pricingSettings;
  const changes = seed.pricingChanges || [];
  const obs = seed.pricingObservations;
  if (!s) return null;

  const adrLift = obs && obs.bookedAdrBefore ? obs.bookedAdrAfter / obs.bookedAdrBefore - 1 : null;

  return (
    <Card
      title="PriceLabs の価格設定"
      note={`${s.asOf} 時点 ・ 手入力`}
      desc="配信される日別価格は、この3つの値と市場データから PriceLabs が算出します。API は未接続のため、変更したら手で記録してください。"
    >
      <div className="pill-row">
        {["minPrice", "basePrice", "maxPrice"].map((k) => (
          <div className="pill" key={k}>
            <div className="k">{LABEL[k]}</div>
            <div className="v">{money(s[k])} 円</div>
          </div>
        ))}
        {obs && (
          <div className="pill">
            <div className="k">配信された日別価格の平均</div>
            <div className="v">
              {money(obs.deliveredPriceAvg)} 円{" "}
              <span style={{ fontSize: 12, color: "var(--muted)" }}>{obs.deliveredDays}日</span>
            </div>
          </div>
        )}
      </div>

      <h3 style={{ fontSize: 12.5, fontWeight: 600, margin: "18px 0 6px" }}>変更履歴</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>日付</th>
              <th>設定</th>
              <th className="num">変更前</th>
              <th className="num">変更後</th>
              <th className="num">変化率</th>
              <th>理由</th>
            </tr>
          </thead>
          <tbody>
            {changes.map((c, i) => (
              <tr key={i}>
                <td>{c.date}</td>
                <td>{LABEL[c.setting] || c.setting}</td>
                <td>
                  {money(c.from)}
                  {c.approximate && <span className="psub"> 概算</span>}
                </td>
                <td>{money(c.to)}</td>
                <td>+{num(((c.to - c.from) / c.from) * 100, 1)}%</td>
                <td style={{ whiteSpace: "normal", maxWidth: 380, color: "var(--text-2)" }}>{c.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {obs && (
        <>
          <h3 style={{ fontSize: 12.5, fontWeight: 600, margin: "18px 0 6px" }}>効果の測り方</h3>
          <p className="desc" style={{ marginBottom: 8 }}>
            Airbnb・Booking.com それぞれで割引を設定しているため、<strong>配信価格と実際の成約単価は一致しません</strong>。
            効果は「入ってきた予約の1泊単価」で測ります。
          </p>
          <div className="pill-row">
            <div className="pill">
              <div className="k">最低価格の引き上げ前（8/01〜8/14）</div>
              <div className="v">{money(obs.bookedAdrBefore)} 円</div>
            </div>
            <div className="pill">
              <div className="k">引き上げ後（8/15〜8/29）</div>
              <div className="v">
                {money(obs.bookedAdrAfter)} 円{" "}
                {adrLift != null && <span style={{ fontSize: 13, color: "var(--up)" }}>+{pct(adrLift, 1)}</span>}
              </div>
            </div>
          </div>
        </>
      )}

      <ul className="footnotes">
        <li>{s.note}</li>
        {obs?.note && <li>{obs.note}</li>}
        <li>
          次の確認は基準価格を変えた2〜3週間後。見るのは ① 入ってきた予約の1泊単価 ② 翌月の埋まり具合の2つ。
          翌月の最終稼働が 63% を下回ったら基準価格を戻します。
        </li>
      </ul>
    </Card>
  );
}
