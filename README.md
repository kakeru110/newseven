# Kamakura Gate Inn 統合分析ダッシュボード

神奈川県鎌倉市大船の民泊 **Kamakura Gate Inn**（1部屋 / 運営: クリプトマネージ合同会社）の
予約・価格・会計を統合した分析ダッシュボード。仕様は [`CLAUDE.md`](./CLAUDE.md) を参照。

**現在のステージ: Stage 1 — 静的データでUI（CLAUDE.md §8 / §12）**
`data/seed.json` のみを入力とし、外部APIには一切接続しません。

## セットアップ

```bash
npm install
npm run dev        # 開発サーバー（http://localhost:5173）
npm run build      # 本番ビルド → dist/
npm run verify     # 完了条件の突合（CLAUDE.md §12）
npm run verify:beds24  # Beds24 と収支表PDFの突合（Stage 2）
npm run build:single   # 1枚のHTMLに固めて dist/standalone.html を出力
npm run test:auth      # Basic 認証ミドルウェアの動作確認
```

`dist/standalone.html` はサーバー不要でそのまま開けます（iPhone への共有・確認用）。

## 完了条件の検証

`npm run verify` が CLAUDE.md §12 の表と突合します。すべて seed.json の生値から計算しており、
結果はハードコードしていません。

| 月 | 売上 | 限界利益率 | 営業損益 |
|---|---|---|---|
| 2026-02 | 234,575 | 26.6% | (123,449) |
| 2026-03 | 635,603 | 35.3% | 38,303 |
| 2026-04 | 587,734 | 44.4% | 73,572 |
| 2026-05 | 602,657 | 50.6% | 115,257 |
| 2026-06 | 475,603 | 46.5% | 31,273 |
| 2026-07 | 530,932 | 42.7% | 36,807 |
| 2026-08（仮） | 834,209 | 48.5% | 214,631 |

通算: 売上 3,901,313円 / 営業損益 386,394円 / 限界利益率 43.7% / 平均稼働率 77.4% — **全項目一致**。

2026年3月は 2026-08-29 に収支表PDFを入手し、逆算値・推定値から実額へ差し替えました
（明細25件の合計がPDFの合計欄と1円まで一致することを確認済み）。

損益分岐価格 P(N)・料率の日付解決・チャネル別の除外月についても同スクリプトで検証しています。

## 画面構成（CLAUDE.md §12 との対応）

| § | セクション | 内容 |
|---|---|---|
| 12-1 | サマリーカード | 期間通算の売上・営業損益・限界利益率・平均稼働率。8月が仮値である旨のバッジ |
| 12-2 | 月次推移 | 売上・限界利益（棒）＋営業損益（折れ線）／限界利益率・稼働率（折れ線）。仮値の月は斜線・破線 |
| 12-3 | 月次P/L | 売上 → 変動費内訳 → 限界利益 → 固定費内訳 → 営業損益 ＋ 参考指標（稼働率・ADR・ALOS・損益分岐） |
| 12-4 | チャネル別比較 | Airbnb / Booking.com の売上・泊数・ADR・実料率・ALOS・1泊あたり限界利益（内訳の無い8月は除外） |
| 12-5 | 損益分岐価格 | 宿泊日数スライダー（1〜14泊）と適用月セレクタ。seed の参照値と並べて表示 |
| 12-6 | ごみ袋トレンド | 袋数/滞在・袋数/泊の2本 |

### 仕様との差異（1点）

§12-2 は「限界利益率と稼働率の折れ線（第2軸）」ですが、**2つの縦軸を1つのプロットに重ねる代わりに、
x軸を共有した上下2段のパネル**にしています。第2軸は2つのスケールの合わせ方が任意になり、
存在しない相関が見えてしまうためです（読み取れる内容は同じ）。
重ね表示に戻したい場合は `src/components/MonthlyTrendChart.jsx` の下段チャートを
上段の `ComposedChart` に `yAxisId` 付きで移すだけで済みます。

## 指標の定義（CLAUDE.md §5）

```
稼働率            = nightsActual / calendarDays        （実泊数を使う）
ADR               = revenue.total / nightsRevenue      （売上計上泊数を使う）
平均宿泊日数(ALOS) = nightsActual / cleaningCount
限界利益           = 売上 − 変動費
損益分岐売上       = 固定費 / 限界利益率
損益分岐価格 P(N)  = (清掃単価 / N + 泊単価) / (1 − OTA料率 − 運営サポート料率 × 消費税)
```

実装は `src/lib/metrics.js` に集約しています。単価・料率は `seed.costRates` を
**有効期間（validFrom / validTo）付きで日付解決**しており、Booking.com の料率が
2026年6月に 13.30% → 14.30% へ変わった実績も過去月を壊さずに再計算できます。

## データの入れ替え

編集するのは `data/seed.json` だけです。UI・計算は seed の生値から自動で再計算されます。
`data/KamakuraGateInn_損益_2026.xlsx` は人間が読む用で、コードからはパースしません。

## ファイル構成

```
CLAUDE.md                     プロジェクト仕様
data/
  seed.json                   Stage 1 の唯一の入力
  KamakuraGateInn_損益_2026.xlsx   人間が読む用（パースしない）
src/
  App.jsx                     画面の組み立て
  lib/metrics.js              指標計算（料率の日付解決を含む）
  lib/format.js               金額・率の表示フォーマット
  components/                 各セクション
scripts/
  verify.mjs                  完了条件の突合
  build-singlefile.mjs        単一HTMLの生成
```

## Beds24 連携（Stage 2）

予約データを Beds24 API v2 から取得し、当月の速報値と先行予約を表示します。
収支表PDFは翌月初にしか届かないため、当月は seed 上すべて仮値になりますが、
Beds24 の予約データは当日時点の実績なので待たずに確定値に近い数字が出せます。

### 設定

Vercel → Settings → Environment Variables に **Production** で追加します。

| 変数名 | 値 |
|---|---|
| `BEDS24_TOKEN` | Beds24 の **Long life token**（読み取り専用） |

トークンは Beds24 の `https://beds24.com/control3.php?pagetype=apiv2` で発行します。
必要なスコープは `read:bookings` / `read:bookings-financial` / `read:properties` です。
未設定の場合、ダッシュボードは「未接続」と表示するだけで、他の表示は影響を受けません。

### 個人情報の扱い

`api/beds24.js` は宿泊者名・メール・電話・住所・コメントを**サーバー側で落としてから**返します。
ブラウザに渡すのは日付・チャネル・金額・人数だけです。
テスト用スナップショット `data/fixtures/beds24-bookings.json` も同じ項目のみで、個人情報は含みません。

### データ品質の検算

Beds24 の Booking.com 売上は、2026年2〜4月の一部予約で実額の 11/12 になっていました
（5月以降は解消）。`commission` は全期間で正しいため、
`commission ÷ price` が想定料率から外れたら `price × 12 ÷ 11` で補正します。

```bash
npm run verify:beds24    # 収支表PDF（seed.json）との突合
```

| 月 | Beds24（補正後） | 収支表PDF | 差 |
|---|---|---|---|
| 2026-03 | 635,622 | 635,603 | +19 |
| 2026-04 | 587,739 | 587,734 | +5 |
| 2026-05〜08 | — | — | **0** |

OTA手数料は全期間で一致します（差は最大20円）。

## 集客データ（Stage 5 の手動入力レイヤー）

Airbnb・Booking.com とも閲覧数の API が存在しないため、管理画面から手入力して
`data/seed.json` の `channelMetrics` に置いています（CLAUDE.md §3-2）。

| 取得元 | 画面 | 主な項目 |
|---|---|---|
| Airbnb | 実績 → 換算 / 稼働率と宿泊料金 | インプレッション・閲覧数・成約率・空室泊数・キャンセル率 |
| Booking.com | エクストラネット アナリティクス | ADR・滞在泊数・リードタイム・キャンセル率と直接競合の同項目 |

読み取った値は Beds24 の実績と突き合わせて検算しています（Airbnb の 52泊・36件は完全一致）。

### 分かること

- **集客ファネル**: インプレッション 26,554 → 閲覧 3,258（12.27%）→ 予約 36件（1.10%）
- **1閲覧あたり限界利益**: 約 167円
- **市場ポジション**: 自施設 ADR 22,711円 に対し直接競合 31,201円（差 8,490円/泊）

**Airbnb 画面の「空室8泊」は実際の空室ではありません。** Airbnb 上で販売可能だったのに埋まらなかった日数です。
実績で分解すると、181泊のうち Airbnb 52泊・Booking.com 89泊が売れ、**40泊がどこでも売れていません**
（うち7泊はキャンセルされた予約が入っていた日）。

在庫を検査するときは、**照合する予約データの期間を在庫の期間以上に取ってください。**
チェックイン日で絞ると、期間外にチェックインして期間内に滞在している予約を取りこぼし、
「予約が無いのに販売不可」を大量に誤検出します。2026-08-30〜12-31 を正しく検査した結果は0日で、
現時点で在庫が不当に塞がれている問題は起きていません。

### 更新のしかた

月に一度、両画面の数字を `channelMetrics` に追記します。API が無いため自動化はできません。
月次のインプレッション・閲覧数は各画面右上の「月間レポート」から取得でき、`channelMetrics.airbnb.monthly` に入ります（現在は未取得）。

### キャンセルの取得

Beds24 の既定の取得にはキャンセルが含まれません。`api/beds24.js` は `status=cancelled` を明示して
別途取得し、売上には含めずに件数だけを数えます（31件・18.7%。Booking.com 表示の 20.0〜21.8% と整合）。

## 本番URLのアクセス制限（Basic 認証）

`middleware.js`（Vercel Edge Middleware）で Basic 認証をかけています。
売上・原価・固定費を含むため、本番URLを素の状態で公開しないための措置です。
CLAUDE.md §12 の「認証・ログイン」はアプリ内のユーザー認証を指すもので、こちらは配信側の保護です。

Vercel の Deployment Protection は Hobby プランでは本番を塞げないため、この方式を採っています。

- Standard Protection … 本番の `.vercel.app` ドメインは保護されない（実測で確認済み）
- All Deployments / Password Protection … Pro プラン限定

### 設定

Vercel → Settings → Environment Variables に、**Production と Preview の両方**へ追加します。

| 変数名 | 値 |
|---|---|
| `BASIC_AUTH_USER` | 任意のユーザー名（未設定なら `kamakura`） |
| `BASIC_AUTH_PASSWORD` | パスワード（日本語も可） |

`BASIC_AUTH_PASSWORD` が未設定の場合、設定漏れによる無防備な公開を防ぐため **503 を返して配信しません**。
環境変数の値は前後の空白・改行を取り除いてから比較します（Secret 型は保存後に値を確認できず、
末尾の改行が原因で入れないと切り分けが難しいため）。

### パスワードが分からなくなったら

Secret 型の値は Vercel でも再表示できません。Environment Variables で `BASIC_AUTH_PASSWORD` を
**Edit → 新しい値で保存**し、Deployments の最新デプロイを **Redeploy** すれば入れ替わります。
ローカル開発（`npm run dev`）ではミドルウェアが動かないため、認証は不要のままです。

動作確認: `npm run test:auth`

## Stage 1 でやらないこと（CLAUDE.md §12）

Beds24 / PriceLabs / freee / GA4 への接続、Supabase の構築、Google Drive からのファイル取得、
PDF のパース、認証・ログイン。いずれも Stage 2 以降で扱います。
