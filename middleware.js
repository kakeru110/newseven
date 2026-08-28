/**
 * Basic 認証（Vercel Edge Middleware）
 *
 * このダッシュボードには売上・原価・固定費が含まれるため、本番URLを素の状態で
 * 公開しない。Vercel の Deployment Protection は
 *   - Standard Protection … 本番の .vercel.app ドメインは保護されない
 *   - All Deployments / Password Protection … Pro プラン限定
 * であり、Hobby プランで本番を塞ぐ手段がこれしかない。
 *
 * 設定（Vercel → Settings → Environment Variables、Production/Preview 両方に追加）
 *   BASIC_AUTH_USER      … 任意のユーザー名（未設定なら "kamakura"）
 *   BASIC_AUTH_PASSWORD  … パスワード
 *
 * 環境変数の値は前後の空白・改行を取り除いてから比較する。コピー&ペーストで
 * 末尾に改行が混ざると「正しいのに入れない」状態になり、Secret 型は保存後に
 * 値を確認できないため原因の切り分けが難しいため。
 *
 * ローカル開発（vite dev）ではミドルウェアは動かないため、認証は不要のまま。
 */
import { next } from "@vercel/edge";

export const config = {
  // Vercel 内部のパス（Analytics など）以外のすべてに適用する
  matcher: "/((?!_vercel/).*)",
};

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8");

/** Basic 認証ヘッダの Base64 を UTF-8 として復号する（atob だけでは多バイト文字が壊れる） */
function decodeCredentials(b64) {
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return decoder.decode(bytes);
}

/** 比較にかかる時間を入力内容に依存させない（総当たりの手がかりを与えない） */
function safeEqual(a, b) {
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  let diff = x.length ^ y.length;
  const len = Math.max(x.length, y.length);
  for (let i = 0; i < len; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

function unauthorized() {
  return new Response("認証が必要です。\n", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Kamakura Gate Inn Dashboard", charset="UTF-8"',
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export default function middleware(request) {
  const expectedUser = (process.env.BASIC_AUTH_USER || "kamakura").trim();
  const expectedPass = (process.env.BASIC_AUTH_PASSWORD || "").trim();

  // 環境変数の設定漏れで無防備に公開されるのを防ぐため、未設定なら配信しない
  if (!expectedPass) {
    return new Response(
      "BASIC_AUTH_PASSWORD が未設定です。Vercel の Settings → Environment Variables で設定してください。\n",
      { status: 503, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } }
    );
  }

  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Basic ")) return unauthorized();

  let decoded = "";
  try {
    decoded = decodeCredentials(header.slice(6).trim());
  } catch {
    return unauthorized();
  }

  const sep = decoded.indexOf(":");
  if (sep < 0) return unauthorized();
  const user = decoded.slice(0, sep);
  const pass = decoded.slice(sep + 1);

  // ユーザー名・パスワードの両方を必ず評価する（早期 return で差が出ないようにする）
  const okUser = safeEqual(user, expectedUser);
  const okPass = safeEqual(pass, expectedPass);
  return okUser && okPass ? next() : unauthorized();
}
