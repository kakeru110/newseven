/* ===========================================================================
 * 民泊ダッシュボード ─ 描画ロジック
 * data/data.js の内容だけを入力とし、KPI・グラフ・表をすべて計算して描画します。
 * 依存ライブラリなし（そのままブラウザで開けます）。
 * =========================================================================== */
(function () {
  "use strict";

  var D = window.MINPAKU_DATA || { settings: {}, properties: [], bookings: [], expenses: [], reviews: [], tasks: [] };
  var S = D.settings || {};
  var NS = "http://www.w3.org/2000/svg";
  var DAY = 86400000;
  var WD = ["日", "月", "火", "水", "木", "金", "土"];

  /* ------------------------------------------------------------------ 汎用 */
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function sv(tag, attrs) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }
  function q(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function toDate(s) { var p = String(s).split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function isoOf(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function ymOf(s) { return String(s).slice(0, 7); }
  function daysInMonth(ym) { var p = ym.split("-"); return new Date(+p[0], +p[1], 0).getDate(); }
  function monthLabel(ym) { var p = ym.split("-"); return +p[1] + "月"; }
  function monthLabelFull(ym) { var p = ym.split("-"); return p[0] + "年" + +p[1] + "月"; }
  function addMonth(ym, n) { var p = ym.split("-"), d = new Date(+p[0], +p[1] - 1 + n, 1); return d.getFullYear() + "-" + pad(d.getMonth() + 1); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function yen(n) { return "¥" + Math.round(n || 0).toLocaleString("ja-JP"); }
  function yenC(n) {           /* 万単位のコンパクト表記（タイル・軸ラベル用） */
    n = Math.round(n || 0);
    if (Math.abs(n) >= 100000000) return "¥" + (n / 100000000).toFixed(2).replace(/\.?0+$/, "") + "億";
    if (Math.abs(n) >= 10000) return "¥" + (n / 10000).toFixed(Math.abs(n) >= 1000000 ? 0 : 1).replace(/\.0$/, "") + "万";
    return yen(n);
  }
  function pct(n, d) { return (d ? (n / d) * 100 : 0); }
  function pctS(v, digits) { return (v || 0).toFixed(digits == null ? 1 : digits) + "%"; }

  /* -------------------------------------------------------- データ前処理 */
  var PROPS = (D.properties || []).slice();
  var PROP_BY_ID = {}; PROPS.forEach(function (p) { PROP_BY_ID[p.id] = p; });
  var BOOKINGS = (D.bookings || []).filter(function (b) { return b.checkIn && b.checkOut && PROP_BY_ID[b.propertyId]; });
  BOOKINGS.forEach(function (b) {
    b._in = toDate(b.checkIn); b._out = toDate(b.checkOut);
    b._nights = Math.max(1, Math.round((b._out - b._in) / DAY));
    b._perNight = (b.amount || 0) / b._nights;
  });
  BOOKINGS.sort(function (a, b) { return a._in - b._in; });

  /* 予約が指定月に持つ宿泊数（チェックアウト日は含めない） */
  function nightsInMonth(b, ym) {
    var n = 0;
    for (var i = 0; i < b._nights; i++) {
      var d = new Date(b._in.getTime() + i * DAY);
      if (d.getFullYear() + "-" + pad(d.getMonth() + 1) === ym) n++;
    }
    return n;
  }
  /* 販売可能室数（掲載開始日を考慮） */
  function availableNights(p, ym) {
    var dim = daysInMonth(ym), parts = ym.split("-");
    var start = new Date(+parts[0], +parts[1] - 1, 1), end = new Date(+parts[0], +parts[1] - 1, dim);
    var from = p.listedFrom ? toDate(p.listedFrom) : start;
    if (from > end) return 0;
    if (from <= start) return dim;
    return dim - (from.getDate() - 1);
  }

  var ALL_MONTHS = (function () {
    var set = {};
    BOOKINGS.forEach(function (b) {
      for (var i = 0; i < b._nights; i++) { var d = new Date(b._in.getTime() + i * DAY); set[d.getFullYear() + "-" + pad(d.getMonth() + 1)] = 1; }
    });
    (D.expenses || []).forEach(function (e) { if (e.month) set[e.month] = 1; });
    return Object.keys(set).sort();
  })();

  /* ------------------------------------------------------------ 集計本体 */
  var statCache = {};
  function stats(ym, propId) {
    var key = ym + "|" + (propId || "all");
    if (statCache[key]) return statCache[key];
    var props = propId ? PROPS.filter(function (p) { return p.id === propId; }) : PROPS;
    var r = { ym: ym, revenue: 0, soldNights: 0, available: 0, count: 0, byChannel: {}, byProperty: {}, expense: 0, byExpense: {} };
    props.forEach(function (p) {
      r.available += availableNights(p, ym);
      r.byProperty[p.id] = { revenue: 0, nights: 0, available: availableNights(p, ym), count: 0 };
    });
    BOOKINGS.forEach(function (b) {
      if (propId && b.propertyId !== propId) return;
      if (!r.byProperty[b.propertyId]) return;
      var n = nightsInMonth(b, ym);
      if (n > 0) {
        var rev = b._perNight * n;
        r.revenue += rev; r.soldNights += n;
        r.byChannel[b.channel || "その他"] = (r.byChannel[b.channel || "その他"] || 0) + rev;
        r.byProperty[b.propertyId].revenue += rev;
        r.byProperty[b.propertyId].nights += n;
      }
      if (ymOf(b.checkIn) === ym) { r.count++; r.byProperty[b.propertyId].count++; }
    });
    (D.expenses || []).forEach(function (e) {
      if (e.month !== ym) return;
      if (propId && e.propertyId !== propId) return;
      if (!PROP_BY_ID[e.propertyId]) return;
      r.expense += e.amount || 0;
      r.byExpense[e.category || "その他"] = (r.byExpense[e.category || "その他"] || 0) + (e.amount || 0);
    });
    r.occupancy = pct(r.soldNights, r.available);
    r.adr = r.soldNights ? r.revenue / r.soldNights : 0;
    r.revpar = r.available ? r.revenue / r.available : 0;
    r.profit = r.revenue - r.expense;
    r.margin = pct(r.profit, r.revenue);
    statCache[key] = r;
    return r;
  }

  /* --------------------------------------------------------- 状態 & 選択 */
  var state = {
    month: (S.defaultMonth && ALL_MONTHS.indexOf(S.defaultMonth) >= 0) ? S.defaultMonth : ALL_MONTHS[ALL_MONTHS.length - 1],
    propId: "",
  };
  var TODAY = new Date(); TODAY.setHours(0, 0, 0, 0);
  function trail(n) { /* 選択月を末尾とする直近 n ヶ月 */
    var out = [], i;
    for (i = n - 1; i >= 0; i--) out.push(addMonth(state.month, -i));
    return out;
  }

  /* --------------------------------------------------------- ツールチップ */
  var tip = q("tip");
  function showTip(evt, title, rows) {
    tip.innerHTML = '<div class="tt">' + esc(title) + "</div>" +
      rows.map(function (r) { return '<div class="tr"><span>' + esc(r[0]) + "</span><b>" + esc(r[1]) + "</b></div>"; }).join("");
    tip.style.opacity = "1";
    var x = clamp(evt.clientX, 130, window.innerWidth - 130);
    tip.style.left = x + "px";
    tip.style.top = Math.max(56, evt.clientY - 12) + "px";
  }
  function hideTip() { tip.style.opacity = "0"; }
  function bindTip(node, title, rows) {
    node.addEventListener("mousemove", function (e) { showTip(e, title, rows); });
    node.addEventListener("mouseleave", hideTip);
  }

  /* ================================================================ グラフ */

  function roundedTop(x, y, w, h, r) {
    r = Math.min(r, w / 2, Math.max(0, h));
    return "M" + x + "," + (y + h) + " L" + x + "," + (y + r) + " Q" + x + "," + y + " " + (x + r) + "," + y +
      " L" + (x + w - r) + "," + y + " Q" + (x + w) + "," + y + " " + (x + w) + "," + (y + r) + " L" + (x + w) + "," + (y + h) + " Z";
  }
  function niceMax(v) {
    if (v <= 0) return 1;
    var e = Math.pow(10, Math.floor(Math.log10(v))), f = v / e;
    var m = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    return m * e;
  }

  /* 縦棒グラフ（月次売上）— 単一系列。選択月のみ強調し、他は同ランプの淡いステップ */
  function columnChart(host, series, opts) {
    host.innerHTML = "";
    var W = Math.max(320, host.clientWidth), H = opts.height || 208;
    var mL = 54, mR = 10, mT = 14, mB = 26;
    var pw = W - mL - mR, ph = H - mT - mB;
    var max = niceMax(Math.max.apply(null, series.map(function (d) { return d.value; }).concat([1])) * 1.12);
    var s = sv("svg", { width: W, height: H, role: "img" });
    var y = function (v) { return mT + ph - (v / max) * ph; };

    for (var i = 0; i <= 4; i++) {
      var gv = (max / 4) * i, gy = y(gv);
      s.appendChild(sv("line", { x1: mL, x2: W - mR, y1: gy, y2: gy, stroke: i ? "var(--grid)" : "var(--axis)", "stroke-width": 1 }));
      var t = sv("text", { x: mL - 8, y: gy + 4, "text-anchor": "end", fill: "var(--muted)", "font-size": 10 });
      t.textContent = opts.tick ? opts.tick(gv) : gv;
      s.appendChild(t);
    }
    var band = pw / series.length, bw = Math.min(24, band - 8);
    var every = band < 26 ? 2 : 1;   /* 幅が狭いときは月ラベルを間引く */
    series.forEach(function (d, i) {
      var bx = mL + band * i + (band - bw) / 2, by = y(d.value), bh = mT + ph - by;
      s.appendChild(sv("path", { d: roundedTop(bx, by, bw, Math.max(bh, 1), 4), fill: d.highlight ? "var(--series-1)" : "var(--series-1-dim)" }));
      if (d.highlight || (series.length - 1 - i) % every === 0) {
        var lab = sv("text", { x: mL + band * i + band / 2, y: H - 8, "text-anchor": "middle", fill: d.highlight ? "var(--text-1)" : "var(--muted)", "font-size": 10 });
        lab.textContent = d.label;
        if (d.highlight) lab.setAttribute("font-weight", "600");
        s.appendChild(lab);
      }
      if (d.highlight) {   /* 直接ラベルは強調した1本だけ */
        var vl = sv("text", { x: bx + bw / 2, y: by - 7, "text-anchor": "middle", fill: "var(--text-1)", "font-size": 11, "font-weight": 600 });
        vl.textContent = opts.label ? opts.label(d.value) : d.value;
        s.appendChild(vl);
      }
      var hit = sv("rect", { x: mL + band * i, y: mT, width: band, height: ph, fill: "transparent" });
      bindTip(hit, d.tipTitle || d.label, d.tip || []);
      hit.addEventListener("click", function () { if (d.key) { state.month = d.key; render(); } });
      hit.style.cursor = d.key ? "pointer" : "default";
      s.appendChild(hit);
    });
    host.appendChild(s);
  }

  /* 折れ線（稼働率推移）— 単一系列 + 目標の基準線 */
  function lineChart(host, series, opts) {
    host.innerHTML = "";
    var W = Math.max(320, host.clientWidth), H = opts.height || 208;
    var mL = 44, mR = 44, mT = 14, mB = 26;
    var pw = W - mL - mR, ph = H - mT - mB;
    var max = Math.max(100, niceMax(Math.max.apply(null, series.map(function (d) { return d.value; }))));
    var s = sv("svg", { width: W, height: H, role: "img" });
    var x = function (i) { return mL + (series.length === 1 ? pw / 2 : (pw / (series.length - 1)) * i); };
    var y = function (v) { return mT + ph - (v / max) * ph; };

    for (var i = 0; i <= 4; i++) {
      var gv = (max / 4) * i, gy = y(gv);
      s.appendChild(sv("line", { x1: mL, x2: W - mR, y1: gy, y2: gy, stroke: i ? "var(--grid)" : "var(--axis)", "stroke-width": 1 }));
      var t = sv("text", { x: mL - 8, y: gy + 4, "text-anchor": "end", fill: "var(--muted)", "font-size": 10 });
      t.textContent = Math.round(gv) + "%";
      s.appendChild(t);
    }
    if (opts.target) {   /* 目標ライン（データではないので控えめな線＋ラベル） */
      var ty = y(opts.target);
      s.appendChild(sv("line", { x1: mL, x2: W - mR, y1: ty, y2: ty, stroke: "var(--axis)", "stroke-width": 1 }));
      var tl = sv("text", { x: W - mR + 6, y: ty + 4, fill: "var(--muted)", "font-size": 10 });
      tl.textContent = "目標 " + opts.target + "%";
      s.appendChild(tl);
    }
    var dLine = series.map(function (d, i) { return (i ? "L" : "M") + x(i) + "," + y(d.value); }).join(" ");
    var dArea = dLine + " L" + x(series.length - 1) + "," + (mT + ph) + " L" + x(0) + "," + (mT + ph) + " Z";
    s.appendChild(sv("path", { d: dArea, fill: "var(--series-1-wash)" }));
    s.appendChild(sv("path", { d: dLine, fill: "none", stroke: "var(--series-1)", "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));

    series.forEach(function (d, i) {
      var last = i === series.length - 1;
      if (d.highlight || last) {
        s.appendChild(sv("circle", { cx: x(i), cy: y(d.value), r: 4.5, fill: "var(--series-1)", stroke: "var(--surface)", "stroke-width": 2 }));
        var vl = sv("text", { x: last ? x(i) - 7 : x(i), y: y(d.value) - 12, "text-anchor": last ? "end" : "middle", fill: "var(--text-1)", "font-size": 11, "font-weight": 600 });
        vl.textContent = pctS(d.value, 0);
        s.appendChild(vl);
      }
      if (d.highlight || (series.length - 1 - i) % (pw / series.length < 26 ? 2 : 1) === 0) {
        var lab = sv("text", { x: x(i), y: H - 8, "text-anchor": "middle", fill: d.highlight ? "var(--text-1)" : "var(--muted)", "font-size": 10 });
        lab.textContent = d.label;
        s.appendChild(lab);
      }
      var hw = pw / series.length;
      var hit = sv("rect", { x: x(i) - hw / 2, y: mT, width: hw, height: ph, fill: "transparent" });
      bindTip(hit, d.tipTitle || d.label, d.tip || []);
      hit.addEventListener("mouseenter", function () { cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i)); cross.setAttribute("opacity", 1); });
      hit.addEventListener("mouseleave", function () { cross.setAttribute("opacity", 0); });
      hit.addEventListener("click", function () { if (d.key) { state.month = d.key; render(); } });
      hit.style.cursor = "pointer";
      s.appendChild(hit);
    });
    var cross = sv("line", { x1: mL, x2: mL, y1: mT, y2: mT + ph, stroke: "var(--axis)", "stroke-width": 1, opacity: 0 });
    s.insertBefore(cross, s.firstChild.nextSibling);
    host.appendChild(s);
  }

  /* 横棒（物件別・チャネル別）— HTML で組み、値は必ず直接ラベル表示 */
  function hBars(host, rows, opts) {
    host.innerHTML = "";
    if (!rows.length) { host.appendChild(el("div", "empty", "データがありません")); return; }
    var max = opts.max || Math.max.apply(null, rows.map(function (r) { return r.value; }).concat([1]));
    var wrap = el("div");
    wrap.style.display = "flex"; wrap.style.flexDirection = "column"; wrap.style.gap = "12px";
    rows.forEach(function (r) {
      var row = el("div");
      var head = el("div");
      head.style.display = "flex"; head.style.justifyContent = "space-between"; head.style.gap = "10px";
      head.style.fontSize = "12px"; head.style.marginBottom = "5px";
      head.innerHTML = '<span style="color:var(--text-1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(r.label) +
        (r.sub ? ' <span style="color:var(--muted);font-size:11px">' + esc(r.sub) + "</span>" : "") + "</span>" +
        '<b style="font-variant-numeric:tabular-nums;font-weight:600">' + esc(r.display) + "</b>";
      var track = el("div");
      track.style.cssText = "position:relative;height:10px;border-radius:0 4px 4px 0;background:var(--series-1-wash)";
      var fill = el("div");
      fill.style.cssText = "height:100%;border-radius:0 4px 4px 0;background:var(--series-1);width:" + clamp((r.value / max) * 100, 0, 100) + "%";
      track.appendChild(fill);
      if (opts.target != null) {   /* 目標位置の基準マーク */
        var mk = el("div");
        mk.style.cssText = "position:absolute;top:-3px;bottom:-3px;width:1px;background:var(--axis);left:" + clamp((opts.target / max) * 100, 0, 100) + "%";
        track.appendChild(mk);
      }
      row.appendChild(head); row.appendChild(track);
      if (r.tip) bindTip(row, r.label, r.tip);
      wrap.appendChild(row);
    });
    host.appendChild(wrap);
  }

  /* スパークライン（KPI タイル） */
  function spark(host, values) {
    host.innerHTML = "";
    if (values.length < 2) return;
    var W = Math.max(80, host.clientWidth), H = 30, mT = 4, mB = 4;
    var max = Math.max.apply(null, values), min = Math.min.apply(null, values);
    var rng = (max - min) || 1;
    var s = sv("svg", { width: W, height: H, class: "spark", "aria-hidden": "true" });
    var x = function (i) { return (W - 6) / (values.length - 1) * i + 3; };
    var y = function (v) { return mT + (H - mT - mB) * (1 - (v - min) / rng); };
    var d = values.map(function (v, i) { return (i ? "L" : "M") + x(i) + "," + y(v); }).join(" ");
    s.appendChild(sv("path", { d: d, fill: "none", stroke: "var(--series-1-dim)", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" }));
    s.appendChild(sv("circle", { cx: x(values.length - 1), cy: y(values[values.length - 1]), r: 4, fill: "var(--series-1)", stroke: "var(--surface)", "stroke-width": 2 }));
    host.appendChild(s);
  }

  /* 稼働カレンダー（物件 × 日）— 予約1件を1本のバーとして描画 */
  function calendar(host, ym, propId) {
    host.innerHTML = "";
    var props = propId ? PROPS.filter(function (p) { return p.id === propId; }) : PROPS;
    if (!props.length) { host.appendChild(el("div", "empty", "物件が登録されていません")); return; }
    var dim = daysInMonth(ym), parts = ym.split("-");
    var W = Math.max(300, host.clientWidth), labW = clamp(W * 0.2, 62, 150);
    var maxChars = Math.max(4, Math.floor(labW / 11));
    var rowH = 30, headH = 20, gap = 6;
    var H = headH + props.length * rowH + 6;
    var pw = W - labW - 6, cw = pw / dim;
    var s = sv("svg", { width: W, height: H });

    for (var d = 1; d <= dim; d++) {
      var dt = new Date(+parts[0], +parts[1] - 1, d), we = dt.getDay() === 0 || dt.getDay() === 6;
      var cx = labW + cw * (d - 1);
      if (we) s.appendChild(sv("rect", { x: cx, y: headH - 4, width: cw, height: props.length * rowH, fill: "var(--surface-2)" }));
      if (d === 1 || d % (cw < 9 ? 10 : 5) === 0 || d === dim) {
        var t = sv("text", { x: cx + cw / 2, y: 12, "text-anchor": "middle", fill: "var(--muted)", "font-size": 10 });
        t.textContent = d; s.appendChild(t);
      }
    }
    props.forEach(function (p, ri) {
      var ry = headH + ri * rowH;
      var lab = sv("text", { x: 0, y: ry + rowH / 2 + 1, fill: "var(--text-2)", "font-size": 11 });
      lab.textContent = p.name.length > maxChars ? p.name.slice(0, maxChars - 1) + "…" : p.name;
      s.appendChild(lab);
      s.appendChild(sv("line", { x1: labW, x2: W - 6, y1: ry + rowH - 3, y2: ry + rowH - 3, stroke: "var(--grid)", "stroke-width": 1 }));
      BOOKINGS.forEach(function (b) {
        if (b.propertyId !== p.id) return;
        var from = null, to = null;
        for (var i = 0; i < b._nights; i++) {
          var dd = new Date(b._in.getTime() + i * DAY);
          if (dd.getFullYear() + "-" + pad(dd.getMonth() + 1) !== ym) continue;
          if (from === null) from = dd.getDate();
          to = dd.getDate();
        }
        if (from === null) return;
        var x0 = labW + cw * (from - 1) + 1, w0 = cw * (to - from + 1) - 2;  /* 2px のサーフェス間隙 */
        var r = sv("rect", { x: x0, y: ry + 5, width: Math.max(w0, 2), height: rowH - 13, rx: 4, fill: "var(--series-1)" });
        bindTip(r, p.name, [
          ["予約番号", b.id || "-"],
          ["期間", b.checkIn + " → " + b.checkOut + "（" + b._nights + "泊）"],
          ["経路", b.channel || "-"],
          ["人数", (b.guests || "-") + "名"],
          ["金額", yen(b.amount)],
        ]);
        s.appendChild(r);
      });
    });
    if (isoOf(TODAY).slice(0, 7) === ym) {   /* 今日の位置 */
      var tx = labW + cw * (TODAY.getDate() - 1) + cw / 2;
      s.appendChild(sv("line", { x1: tx, x2: tx, y1: headH - 4, y2: H - 4, stroke: "var(--critical)", "stroke-width": 1 }));
      var tt = sv("text", { x: tx, y: headH - 8, "text-anchor": "middle", fill: "var(--critical)", "font-size": 9, "font-weight": 600 });
      tt.textContent = "今日"; s.appendChild(tt);
    }
    host.appendChild(s);
  }

  /* ================================================================ 各パーツ */

  function tile(host, o) {
    host.innerHTML = "";
    host.appendChild(el("div", "label", esc(o.label)));
    host.appendChild(el("div", "value", esc(o.value)));
    var foot = el("div", "foot");
    if (o.delta != null && isFinite(o.delta)) {
      var up = o.delta > 0.05, down = o.delta < -0.05;
      var good = o.inverse ? down : up;
      var cls = (!up && !down) ? "flat" : (good ? "up" : "down");
      foot.appendChild(el("span", "delta " + cls,
        (up ? "▲" : down ? "▼" : "±") + " " + Math.abs(o.delta).toFixed(1) + "%" +
        ' <span class="cmp">前月比</span>'));
    }
    if (o.note) foot.appendChild(el("span", "cmp", '<span style="color:var(--muted);font-size:11px">' + esc(o.note) + "</span>"));
    host.appendChild(foot);
    if (o.spark) { var sp = el("div"); host.appendChild(sp); spark(sp, o.spark); }
    if (o.meter) {
      var m = el("div", "meter");
      m.innerHTML = '<div class="meter-track"><div class="meter-fill" style="width:' + clamp(o.meter.value, 0, 100) + '%"></div></div>' +
        '<div class="meter-cap"><span>' + esc(o.meter.left) + "</span><span>" + esc(o.meter.right) + "</span></div>";
      host.appendChild(m);
    }
  }

  function renderKpis() {
    var cur = stats(state.month, state.propId), prev = stats(addMonth(state.month, -1), state.propId);
    var hist = trail(12).map(function (m) { return stats(m, state.propId); });
    var dlt = function (a, b) { return b ? ((a - b) / Math.abs(b)) * 100 : NaN; };
    var target = state.propId ? (S.monthlyRevenueTarget || 0) / Math.max(PROPS.length, 1) : (S.monthlyRevenueTarget || 0);

    tile(q("kpi-revenue"), {
      label: "売上（" + monthLabelFull(state.month) + "）", value: yen(cur.revenue), delta: dlt(cur.revenue, prev.revenue),
      meter: target ? { value: pct(cur.revenue, target), left: "目標達成率 " + pctS(pct(cur.revenue, target), 0), right: "目標 " + yenC(target) } : null,
    });
    tile(q("kpi-occ"), { label: "稼働率", value: pctS(cur.occupancy), delta: cur.occupancy - prev.occupancy, note: cur.soldNights + " / " + cur.available + " 泊", spark: hist.map(function (s) { return s.occupancy; }) });
    tile(q("kpi-adr"), { label: "ADR（平均宿泊単価）", value: yen(cur.adr), delta: dlt(cur.adr, prev.adr), spark: hist.map(function (s) { return s.adr; }) });
    tile(q("kpi-revpar"), { label: "RevPAR（1室あたり売上）", value: yen(cur.revpar), delta: dlt(cur.revpar, prev.revpar), spark: hist.map(function (s) { return s.revpar; }) });
    tile(q("kpi-bookings"), { label: "予約件数", value: cur.count + " 件", delta: dlt(cur.count, prev.count), note: "平均 " + (cur.count ? (cur.soldNights / cur.count).toFixed(1) : "0") + " 泊/件", spark: hist.map(function (s) { return s.count; }) });
    tile(q("kpi-profit"), { label: "営業利益", value: yen(cur.profit), delta: dlt(cur.profit, prev.profit), note: "利益率 " + pctS(cur.margin), spark: hist.map(function (s) { return s.profit; }) });
    var rev = (D.reviews || []).filter(function (r) { return !state.propId || r.propertyId === state.propId; });
    var n5 = rev.filter(function (r) { return (r.scale || 5) === 5; });
    var avg = n5.length ? n5.reduce(function (s, r) { return s + r.rating * (r.count || 1); }, 0) / n5.reduce(function (s, r) { return s + (r.count || 1); }, 0) : 0;
    var cnt = rev.reduce(function (s, r) { return s + (r.count || 0); }, 0);
    tile(q("kpi-review"), { label: "レビュー評価（5点満点換算）", value: avg ? avg.toFixed(2) : "—", note: cnt + " 件のレビュー" });
  }

  function renderCharts() {
    var months = trail(12);
    var series = months.map(function (m) {
      var s = stats(m, state.propId);
      return {
        label: monthLabel(m), key: m, value: Math.round(s.revenue), highlight: m === state.month,
        tipTitle: monthLabelFull(m),
        tip: [["売上", yen(s.revenue)], ["稼働率", pctS(s.occupancy)], ["ADR", yen(s.adr)], ["予約件数", s.count + " 件"], ["営業利益", yen(s.profit)]],
      };
    });
    columnChart(q("chart-revenue"), series, { tick: function (v) { return v >= 10000 ? Math.round(v / 10000) + "万" : Math.round(v); }, label: yenC });

    var occ = months.map(function (m) {
      var s = stats(m, state.propId);
      return { label: monthLabel(m), key: m, value: s.occupancy, highlight: m === state.month, tipTitle: monthLabelFull(m), tip: [["稼働率", pctS(s.occupancy)], ["稼働日数", s.soldNights + " / " + s.available + " 泊"], ["RevPAR", yen(s.revpar)]] };
    });
    lineChart(q("chart-occupancy"), occ, { target: S.targetOccupancy || null });

    /* 物件別 稼働率 */
    var cur = stats(state.month, state.propId);
    var pr = PROPS.filter(function (p) { return !state.propId || p.id === state.propId; }).map(function (p) {
      var v = cur.byProperty[p.id] || { revenue: 0, nights: 0, available: 0, count: 0 };
      var o = pct(v.nights, v.available);
      return { label: p.name, sub: p.area, value: o, display: pctS(o, 0), tip: [["稼働率", pctS(o)], ["稼働日数", v.nights + " / " + v.available + " 泊"], ["売上", yen(v.revenue)]] };
    }).sort(function (a, b) { return b.value - a.value; });
    hBars(q("chart-prop-occ"), pr, { max: 100, target: S.targetOccupancy || null });

    /* チャネル別 売上構成 */
    var ch = Object.keys(cur.byChannel).map(function (k) {
      return { label: k, value: cur.byChannel[k], display: yenC(cur.byChannel[k]), sub: pctS(pct(cur.byChannel[k], cur.revenue), 0), tip: [["売上", yen(cur.byChannel[k])], ["構成比", pctS(pct(cur.byChannel[k], cur.revenue))]] };
    }).sort(function (a, b) { return b.value - a.value; });
    hBars(q("chart-channel"), ch, {});

    /* 経費内訳 */
    var ex = Object.keys(cur.byExpense).map(function (k) {
      return { label: k, value: cur.byExpense[k], display: yenC(cur.byExpense[k]), sub: pctS(pct(cur.byExpense[k], cur.expense), 0), tip: [["金額", yen(cur.byExpense[k])], ["経費に占める割合", pctS(pct(cur.byExpense[k], cur.expense))]] };
    }).sort(function (a, b) { return b.value - a.value; });
    hBars(q("chart-expense"), ex, {});
    q("expense-summary").innerHTML = "経費合計 <b>" + yen(cur.expense) + "</b>　/　営業利益 <b>" + yen(cur.profit) + "</b>（利益率 " + pctS(cur.margin) + "）";

    calendar(q("calendar"), state.month, state.propId);
  }

  function renderTables() {
    var cur = stats(state.month, state.propId);
    /* 物件一覧 */
    var rows = PROPS.filter(function (p) { return !state.propId || p.id === state.propId; }).map(function (p) {
      var v = cur.byProperty[p.id] || { revenue: 0, nights: 0, available: 0, count: 0 };
      var o = pct(v.nights, v.available);
      var next = BOOKINGS.filter(function (b) { return b.propertyId === p.id && b._in >= TODAY; })[0];
      var rv = (D.reviews || []).filter(function (r) { return r.propertyId === p.id && (r.scale || 5) === 5; });
      var avg = rv.length ? rv.reduce(function (s, r) { return s + r.rating * (r.count || 1); }, 0) / rv.reduce(function (s, r) { return s + (r.count || 1); }, 0) : 0;
      var cls = o >= (S.targetOccupancy || 80) ? "good" : o >= (S.targetOccupancy || 80) * 0.75 ? "warn" : "crit";
      return "<tr>" +
        '<td><div class="pname">' + esc(p.name) + '</div><div class="psub">' + esc(p.area) + " ・ 定員" + esc(p.capacity || "-") + "名</div></td>" +
        '<td class="num"><div class="bar-cell"><span class="bar-mini"><i style="width:' + clamp(o, 0, 100) + '%"></i></span>' + pctS(o, 0) + "</div></td>" +
        '<td class="num">' + yen(v.revenue) + "</td>" +
        '<td class="num">' + yen(v.nights ? v.revenue / v.nights : 0) + "</td>" +
        '<td class="num">' + v.count + "</td>" +
        '<td class="num">' + (avg ? avg.toFixed(2) : "—") + "</td>" +
        "<td>" + (next ? esc(next.checkIn) + '<span class="psub"> ' + esc(next.channel || "") + "</span>" : '<span class="psub">予定なし</span>') + "</td>" +
        '<td><span class="chip ' + cls + '"><span class="dot"></span>' + (cls === "good" ? "目標達成" : cls === "warn" ? "やや低調" : "要対策") + "</span></td>" +
        "</tr>";
    }).join("");
    q("tbl-properties").innerHTML = rows || '<tr><td colspan="8" class="empty">物件が登録されていません</td></tr>';

    /* 月次サマリー（グラフの表ビュー） */
    q("tbl-monthly").innerHTML = trail(12).map(function (m) {
      var s = stats(m, state.propId);
      return "<tr" + (m === state.month ? ' style="font-weight:600"' : "") + "><td>" + monthLabelFull(m) + "</td>" +
        '<td class="num">' + yen(s.revenue) + '</td><td class="num">' + pctS(s.occupancy) + '</td><td class="num">' + yen(s.adr) +
        '</td><td class="num">' + yen(s.revpar) + '</td><td class="num">' + s.count + '</td><td class="num">' + yen(s.profit) + "</td></tr>";
    }).join("");
  }

  function renderLists() {
    /* 直近の動き（チェックイン / チェックアウト・清掃） */
    var ev = [];
    BOOKINGS.forEach(function (b) {
      if (state.propId && b.propertyId !== state.propId) return;
      if (b._in >= TODAY) ev.push({ d: b._in, type: "チェックイン", b: b });
      if (b._out >= TODAY) ev.push({ d: b._out, type: "チェックアウト・清掃", b: b });
    });
    ev.sort(function (a, b) { return a.d - b.d || (a.type < b.type ? -1 : 1); });
    var host = q("list-upcoming"); host.innerHTML = "";
    if (!ev.length) host.appendChild(el("div", "empty", "予定されている予約はありません"));
    ev.slice(0, 14).forEach(function (e) {
      var p = PROP_BY_ID[e.b.propertyId] || {};
      var r = el("div", "row");
      r.innerHTML = '<div class="date"><b>' + (e.d.getMonth() + 1) + "/" + e.d.getDate() + "</b>" + WD[e.d.getDay()] + "</div>" +
        '<div class="main"><div class="t">' + esc(e.type) + " ・ " + esc(p.name || "") + "</div>" +
        '<div class="s">' + esc(e.b.guestName || "ゲスト") + " ・ " + esc(e.b.channel || "") + " ・ " + e.b._nights + "泊 ・ " + esc(e.b.guests || "-") + "名</div></div>" +
        '<div class="end">' + (e.type === "チェックイン" ? yen(e.b.amount) : '<span class="psub">' + esc(e.b.id || "") + "</span>") + "</div>";
      host.appendChild(r);
    });

    /* タスク（完了状態はブラウザに保存） */
    var done = {};
    try { done = JSON.parse(localStorage.getItem("minpaku.tasks") || "{}"); } catch (err) { done = {}; }
    var th = q("list-tasks"); th.innerHTML = "";
    var tasks = (D.tasks || []).filter(function (t) { return !state.propId || t.propertyId === state.propId; })
      .slice().sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
    if (!tasks.length) th.appendChild(el("div", "empty", "登録されたタスクはありません"));
    tasks.forEach(function (t, i) {
      var key = t.date + "|" + t.propertyId + "|" + t.title, isDone = t.done || done[key];
      var p = PROP_BY_ID[t.propertyId] || {};
      var d = t.date ? toDate(t.date) : null;
      var late = d && d < TODAY && !isDone;
      var r = el("div", "row");
      r.innerHTML = '<div class="date"><b>' + (d ? (d.getMonth() + 1) + "/" + d.getDate() : "—") + "</b>" + (d ? WD[d.getDay()] : "") + "</div>" +
        '<div class="main"><div class="t" style="' + (isDone ? "text-decoration:line-through;color:var(--muted)" : "") + '">' + esc(t.title || "") + "</div>" +
        '<div class="s">' + esc(p.name || "全物件") + " ・ " + esc(t.type || "タスク") + (late ? " ・ 期限超過" : "") + "</div></div>" +
        '<div class="end"><span class="chip ' + (isDone ? "good" : late ? "crit" : "warn") + '"><span class="dot"></span>' + (isDone ? "完了" : late ? "遅延" : "未完了") + "</span></div>";
      r.style.cursor = "pointer";
      r.addEventListener("click", function () {
        done[key] = !isDone;
        try { localStorage.setItem("minpaku.tasks", JSON.stringify(done)); } catch (err) { /* 保存できない環境では表示のみ */ }
        renderLists();
      });
      th.appendChild(r);
    });
  }

  /* ------------------------------------------------------------ コントロール */
  function renderControls() {
    var ms = q("sel-month");
    if (!ms.options.length) {
      ALL_MONTHS.forEach(function (m) { var o = document.createElement("option"); o.value = m; o.textContent = monthLabelFull(m); ms.appendChild(o); });
    }
    ms.value = state.month;
    var ps = q("sel-property");
    if (!ps.options.length) {
      var all = document.createElement("option"); all.value = ""; all.textContent = "全物件（" + PROPS.length + "件）"; ps.appendChild(all);
      PROPS.forEach(function (p) { var o = document.createElement("option"); o.value = p.id; o.textContent = p.name; ps.appendChild(o); });
    }
    ps.value = state.propId;
    q("scope-note").textContent = (state.propId ? (PROP_BY_ID[state.propId] || {}).name : "全物件") + " ・ " + monthLabelFull(state.month);
  }

  function render() {
    renderControls();
    renderKpis();
    renderCharts();
    renderTables();
    renderLists();
  }

  /* --------------------------------------------------------------- 初期化 */
  function init() {
    document.title = (S.title || "民泊ダッシュボード");
    q("app-title").textContent = S.title || "民泊ダッシュボード";
    q("app-sub").textContent = S.subtitle || "";
    if (!S.demo) { var b = q("demo-badge"); if (b) b.remove(); }
    q("updated").textContent = "表示日 " + isoOf(TODAY);

    if (!ALL_MONTHS.length) {
      document.querySelector("main").innerHTML = '<div class="card"><div class="empty">data/data.js に予約データを入力するとダッシュボードが表示されます。</div></div>';
      return;
    }
    q("sel-month").addEventListener("change", function (e) { state.month = e.target.value; render(); });
    q("sel-property").addEventListener("change", function (e) { state.propId = e.target.value; render(); });

    var saved = null;
    try { saved = localStorage.getItem("minpaku.theme"); } catch (err) { saved = null; }
    if (saved) document.documentElement.setAttribute("data-theme", saved);
    q("theme-toggle").addEventListener("click", function () {
      var isDark = document.documentElement.getAttribute("data-theme") === "dark" ||
        (!document.documentElement.getAttribute("data-theme") && window.matchMedia("(prefers-color-scheme: dark)").matches);
      var next = isDark ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem("minpaku.theme", next); } catch (err) { /* 保存不可でも動作する */ }
      renderCharts();
    });

    render();
    var t = null;
    window.addEventListener("resize", function () { clearTimeout(t); t = setTimeout(renderCharts, 150); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
