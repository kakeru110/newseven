import { useEffect, useState } from "react";

/**
 * Search Console のデータを1回だけ取得するフック。
 * 認証情報はサーバー側の /api/searchconsole が保持し、ブラウザには渡らない。
 *
 * 未設定（503）は「エラー」ではなく「未接続」として扱う。設定手順を画面に出したいため。
 */
export function useSearchConsole() {
  const [state, setState] = useState({ status: "loading" });
  useEffect(() => {
    let alive = true;
    fetch("/api/searchconsole")
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (r.status === 503) return { status: "unconfigured", message: body.error, setup: body.setup };
        if (r.status === 403) return { status: "forbidden", message: body.error };
        if (!r.ok) throw new Error(body.error || `取得に失敗しました（${r.status}）`);
        return { status: "ok", data: body };
      })
      .then((s) => alive && setState(s))
      .catch((err) => alive && setState({ status: "error", message: String(err.message || err) }));
    return () => { alive = false; };
  }, []);
  return state;
}
