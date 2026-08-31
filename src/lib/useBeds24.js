import { useEffect, useState } from "react";

/**
 * Beds24 の予約データを1回だけ取得して共有するフック。
 * トークンはサーバー側の /api/beds24 が保持し、ブラウザには渡らない。
 */
export function useBeds24() {
  const [state, setState] = useState({ status: "loading" });
  useEffect(() => {
    let alive = true;
    fetch("/api/beds24")
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error || `取得に失敗しました（${r.status}）`);
        return body;
      })
      .then((data) => alive && setState({ status: "ok", data }))
      .catch((err) => alive && setState({ status: "error", message: String(err.message || err) }));
    return () => { alive = false; };
  }, []);
  return state;
}
