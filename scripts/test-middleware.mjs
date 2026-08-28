/**
 * middleware.js の動作確認
 *   node scripts/test-middleware.mjs
 */
import middleware from "../middleware.js";

let failed = 0;
const check = (label, cond) => {
  if (!cond) failed++;
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}`);
};
const req = (auth) =>
  new Request("https://example.com/", auth ? { headers: { authorization: auth } } : undefined);
const basic = (u, p) => "Basic " + Buffer.from(`${u}:${p}`).toString("base64");

console.log("■ BASIC_AUTH_PASSWORD 未設定のとき");
delete process.env.BASIC_AUTH_PASSWORD;
check("配信せず 503 を返す", (await middleware(req())).status === 503);

console.log("\n■ 設定済みのとき");
process.env.BASIC_AUTH_USER = "kamakura";
process.env.BASIC_AUTH_PASSWORD = "s3cret-pass";

const noHeader = await middleware(req());
check("認証ヘッダなし → 401", noHeader.status === 401);
check("WWW-Authenticate を返す", /^Basic realm=/.test(noHeader.headers.get("www-authenticate") || ""));
check("パスワード違い → 401", (await middleware(req(basic("kamakura", "wrong")))).status === 401);
check("ユーザー名違い → 401", (await middleware(req(basic("other", "s3cret-pass")))).status === 401);
check("壊れた Base64 → 401", (await middleware(req("Basic !!!not-base64!!!")))?.status === 401);
check("Basic 以外の方式 → 401", (await middleware(req("Bearer token")))?.status === 401);

const ok = await middleware(req(basic("kamakura", "s3cret-pass")));
check("正しい認証情報 → 通常配信（401/503 を返さない）", ok.status !== 401 && ok.status !== 503);

console.log(failed === 0 ? "\n✅ すべて期待どおりです" : `\n❌ ${failed} 件が失敗`);
process.exit(failed === 0 ? 0 : 1);
