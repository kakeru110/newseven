/**
 * Search Console 検索パフォーマンスの取得（Vercel Serverless Function）
 *
 * CLAUDE.md §2 の絶対条件により、認証情報はフロントに出さない。
 * この関数だけがサービスアカウント鍵を持ち、ブラウザには集計値だけを返す。
 *
 * 環境変数:
 *   GSC_SERVICE_ACCOUNT_KEY … サービスアカウントの JSON 鍵（そのまま、または Base64）
 *   GSC_SITE_URL            … 対象プロパティ（既定 https://kamakuragateinn.com/）
 *
 * 事前設定（CLAUDE.md §3-5）:
 *   1. GCP でサービスアカウントを作り、JSON 鍵を発行する
 *   2. その GCP プロジェクトで Search Console API を有効化する
 *   3. Search Console → 設定 → ユーザーと権限 で、サービスアカウントの
 *      メールアドレス（...iam.gserviceaccount.com）を「制限付き」で追加する
 *
 * freee と違い OAuth の認可コードフローもリフレッシュトークンも要らない。
 * JWT を自己署名してアクセストークンを取るだけなので、
 * §3-3 のトークンローテーション問題を構造的に踏まない。
 */
import crypto from "node:crypto";

const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://searchconsole.googleapis.com/webmasters/v3";

const DEFAULT_SITE = "https://kamakuragateinn.com/";
const MONTHS_BACK = 16;   // Search Console の保持上限
const RECENT_DAYS = 90;   // 検索語・ページ・デバイスの集計窓

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const b64url = (buf) => Buffer.from(buf).toString("base64url");

/** 鍵は生 JSON でも Base64 でも受ける。Vercel に貼るとき改行が壊れやすいため */
function parseKey(raw) {
  const s = (raw || "").trim();
  if (!s) return null;
  const text = s.startsWith("{") ? s : Buffer.from(s, "base64").toString("utf8");
  const key = JSON.parse(text);
  if (!key.client_email || !key.private_key) throw new Error("client_email / private_key がありません");
  // 環境変数経由だと改行が \n のリテラルになることがある
  key.private_key = key.private_key.replace(/\\n/g, "\n");
  return key;
}

/** サービスアカウントの JWT を自己署名し、アクセストークンと交換する */
async function fetchAccessToken(key) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: key.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600,
  }));
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${header}.${claim}`);
  const jwt = `${header}.${claim}.${b64url(signer.sign(key.private_key))}`;

  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`トークン取得に失敗（${r.status}）: ${JSON.stringify(json).slice(0, 200)}`);
  return json.access_token;
}

/**
 * Search Analytics のクエリ。
 * dataState は既定の "final"（確定値のみ）。直近2〜3日は確定していないため
 * 既定では出てこない。ここを "all" にすると未確定値が混ざり、
 * 「昨日は急に減った」という読み違いを生む。
 */
async function searchAnalytics(token, siteUrl, body) {
  const url = `${API}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const r = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ dataState: "final", ...body }),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = json?.error?.message || JSON.stringify(json).slice(0, 200);
    const err = new Error(msg);
    err.status = r.status;
    throw err;
  }
  return json.rows || [];
}

const asRow = (row, keyName) => ({
  [keyName]: row.keys?.[0] ?? null,
  clicks: row.clicks || 0,
  impressions: row.impressions || 0,
  position: row.position || 0,
});

export default async function handler(req, res) {
  let key;
  try {
    key = parseKey(process.env.GSC_SERVICE_ACCOUNT_KEY);
  } catch (err) {
    res.status(503).json({ error: "GSC_SERVICE_ACCOUNT_KEY の形式が不正です", detail: String(err.message).slice(0, 200) });
    return;
  }
  if (!key) {
    res.status(503).json({
      error: "GSC_SERVICE_ACCOUNT_KEY が未設定です。Vercel の Settings → Environment Variables で設定してください。",
      setup: "GCP でサービスアカウントを作成 → Search Console API を有効化 → Search Console の「ユーザーと権限」にそのメールアドレスを追加。",
    });
    return;
  }

  const siteUrl = (process.env.GSC_SITE_URL || DEFAULT_SITE).trim();
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth() - MONTHS_BACK, today.getDate());
  const recent = new Date(today.getTime() - RECENT_DAYS * 86400000);

  try {
    const token = await fetchAccessToken(key);
    const range = { startDate: iso(start), endDate: iso(today) };

    /* 日次は必須。検索語・ページ・デバイスは失敗しても本体を落とさない */
    const daily = await searchAnalytics(token, siteUrl, { ...range, dimensions: ["date"], rowLimit: 25000 });

    const optional = async (dimensions, rowLimit) => {
      try {
        return await searchAnalytics(token, siteUrl, {
          startDate: iso(recent), endDate: iso(today), dimensions, rowLimit,
        });
      } catch { return []; }
    };
    const [queries, pages, devices] = await Promise.all([
      optional(["query"], 100),
      optional(["page"], 25),
      optional(["device"], 5),
    ]);

    /* Search Console は日次で更新されるため、CDN 側で6時間キャッシュする */
    res.setHeader("Cache-Control", "public, s-maxage=21600, stale-while-revalidate=86400");
    res.status(200).json({
      fetchedAt: new Date().toISOString(),
      siteUrl,
      requested: range,
      recentWindow: { startDate: iso(recent), endDate: iso(today), days: RECENT_DAYS },
      daily: daily.map((r) => asRow(r, "date")).sort((a, b) => a.date.localeCompare(b.date)),
      queries: queries.map((r) => asRow(r, "query")),
      pages: pages.map((r) => asRow(r, "page")),
      devices: devices.map((r) => asRow(r, "device")),
    });
  } catch (err) {
    const status = err.status === 403 ? 403 : 502;
    res.status(status).json({
      error: status === 403
        ? `このサービスアカウントに ${siteUrl} の閲覧権限がありません。Search Console の「ユーザーと権限」に ${key.client_email} を追加してください。`
        : "Search Console API への接続に失敗しました",
      detail: String(err.message || err).slice(0, 300),
    });
  }
}
