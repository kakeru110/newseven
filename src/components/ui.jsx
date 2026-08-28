import React from "react";

export function Card({ title, note, desc, children, className = "" }) {
  return (
    <section className={`card ${className}`}>
      {(title || note) && (
        <header>
          {title && <h2>{title}</h2>}
          {note && <span className="note">{note}</span>}
        </header>
      )}
      {desc && <p className="desc">{desc}</p>}
      {children}
    </section>
  );
}

/** 系列凡例（2系列以上では必ず表示し、色だけに頼らせない） */
export function Legend({ items }) {
  return (
    <div className="legend">
      {items.map((it) => (
        <span key={it.label}>
          <i className={it.type === "line" ? "line" : it.type === "hatch" ? "hatch" : ""}
             style={it.color ? { background: it.color } : undefined} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

/** recharts 共通のツールチップ（本文は必ずテキストトークンで描く） */
export function ChartTooltip({ active, payload, label, rows, provisional }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="tooltip">
      <div className="tt">{label}</div>
      {rows(payload).map((r) => (
        <div className="tr" key={r[0]}>
          <span>{r[0]}</span>
          <b>{r[1]}</b>
        </div>
      ))}
      {provisional && provisional(payload) && <div className="tp">仮値（月未了）</div>}
    </div>
  );
}

export const axisProps = {
  tick: { fill: "var(--muted)", fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: "var(--axis)" },
};
