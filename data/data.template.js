/* ===========================================================================
 * 民泊ダッシュボード ─ 入力テンプレート（空データ）
 * ---------------------------------------------------------------------------
 * 使い方:
 *   1. このファイルを data/data.js に上書きコピーします
 *        cp data/data.template.js data/data.js
 *   2. 下のコメントに沿って、ご自身の物件・予約・経費を追記します
 *   3. index.html をブラウザで開くと、数値とグラフが自動計算されます
 * =========================================================================== */

const MINPAKU_DATA = {
  settings: {
    title: "民泊ダッシュボード",        // 画面上部のタイトル（屋号など）
    subtitle: "",                        // タイトル下の補足（空でも可）
    currency: "JPY",
    targetOccupancy: 80,                 // 目標稼働率（%）
    monthlyRevenueTarget: 1000000,       // 目標月商（円）
    defaultMonth: null,                  // 初期表示月 "YYYY-MM"（null で最新月）
    demo: false,                         // 本番データなので false
  },

  /* --- 物件マスタ ---------------------------------------------------------
   * id          : 半角英数の識別子（予約・経費から参照します）※必須
   * name        : 物件名 ※必須
   * area        : エリア表記（例 "東京都台東区"）
   * capacity    : 定員（人）
   * bedrooms    : 寝室数
   * cleaningFee : 1回あたり清掃料金（円）
   * listedFrom  : 掲載開始日 "YYYY-MM-DD"（稼働率の分母に反映されます）
   * memo        : 任意メモ
   * --------------------------------------------------------------------- */
  properties: [
    // { "id": "house1", "name": "物件名", "area": "○○県○○市", "capacity": 4, "bedrooms": 2, "cleaningFee": 8000, "listedFrom": "2026-01-01", "memo": "" },
  ],

  /* --- 予約明細（売上・稼働率の元データ） ---------------------------------
   * id          : 予約番号（任意の文字列）
   * propertyId  : 物件マスタの id ※必須
   * channel     : 予約経路（"Airbnb" / "Booking.com" / "楽天トラベル" / "直販" など）
   * guestName   : ゲスト名
   * guests      : 宿泊人数
   * checkIn     : 入室日 "YYYY-MM-DD" ※必須
   * checkOut    : 退室日 "YYYY-MM-DD" ※必須（宿泊数 = 退室日 - 入室日）
   * nightlyRate : 1泊あたり単価（円・任意）
   * amount      : 受取総額（円・清掃費込み）※必須
   * status      : "confirmed"（確定） / "completed"（宿泊済み） など
   * --------------------------------------------------------------------- */
  bookings: [
    // { "id": "BK0001", "propertyId": "house1", "channel": "Airbnb", "guestName": "山田 太郎", "guests": 2, "checkIn": "2026-01-10", "checkOut": "2026-01-13", "nightlyRate": 20000, "amount": 68000, "status": "completed" },
  ],

  /* --- 経費（月次・物件別。営業利益の計算に使用） -------------------------
   * month      : "YYYY-MM" ※必須
   * propertyId : 物件マスタの id ※必須
   * category   : 費目（例 "清掃費" "プラットフォーム手数料" "光熱費・通信" "賃料・ローン"）
   * amount     : 金額（円）
   * --------------------------------------------------------------------- */
  expenses: [
    // { "month": "2026-01", "propertyId": "house1", "category": "清掃費", "amount": 24000 },
  ],

  /* --- レビュー ------------------------------------------------------------
   * rating : 評価点、scale : 満点（省略時は 5。Booking.com など10点満点は scale: 10）
   * count  : レビュー件数
   * --------------------------------------------------------------------- */
  reviews: [
    // { "propertyId": "house1", "channel": "Airbnb", "rating": 4.8, "count": 20 },
  ],

  /* --- タスク（清掃以外の予定。清掃はチェックアウトから自動表示） ---------
   * date : "YYYY-MM-DD" / type : 区分 / title : 内容 / done : 完了フラグ
   * --------------------------------------------------------------------- */
  tasks: [
    // { "date": "2026-01-15", "propertyId": "house1", "type": "点検", "title": "エアコン清掃", "done": false },
  ],
};

if (typeof window !== "undefined") window.MINPAKU_DATA = MINPAKU_DATA;
if (typeof module !== "undefined") module.exports = MINPAKU_DATA;
