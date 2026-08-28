/**
 * dist/ のビルド結果を1枚の HTML にまとめて dist/standalone.html を出力する。
 *   npm run build && node scripts/build-singlefile.mjs
 * サーバー不要でそのまま開けるため、iPhone への共有や動作確認に使う。
 */
import { readFile, writeFile, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

const html = await readFile(join(dist, "index.html"), "utf8");
const assets = await readdir(join(dist, "assets"));
const jsFile = assets.find((f) => f.endsWith(".js"));
const cssFile = assets.find((f) => f.endsWith(".css"));

const js = await readFile(join(dist, "assets", jsFile), "utf8");
const css = await readFile(join(dist, "assets", cssFile), "utf8");

const out = html
  /* 置換文字列に含まれる "$&" が展開されないよう、必ず関数形式で差し込む */
  .replace(new RegExp(`<link[^>]*href="[^"]*${cssFile}"[^>]*>`), () => `<style>\n${css}\n</style>`)
  .replace(
    new RegExp(`<script[^>]*src="[^"]*${jsFile}"[^>]*></script>`),
    () => `<script type="module">\n${js.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--")}\n</script>`
  );

await writeFile(join(dist, "standalone.html"), out, "utf8");
console.log(`dist/standalone.html を作成しました（${(Buffer.byteLength(out) / 1024).toFixed(0)} KB）`);
