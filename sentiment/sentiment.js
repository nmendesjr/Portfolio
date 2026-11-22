(() => {
  "use strict";

  // ---------- State ----------
  const params = new URLSearchParams(location.search);
  const state = {
    window: ["1d", "7d", "30d"].includes(params.get("w")) ? params.get("w") : "7d",
    selected: params.get("c") || null,
    data: null,
    cache: {},
    pressTab: "neg",
    publicTab: "top",
  };

  const $ = (id) => document.getElementById(id);
  const main = $("main");
  const tooltip = $("tooltip");

  // ---------- Helpers ----------
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "style") Object.assign(el.style, v);
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
    return el;
  }
  const SVGNS = "http://www.w3.org/2000/svg";
  function s(tag, attrs, ...children) {
    const el = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null) continue;
      if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v);
    }
    for (const c of children.flat()) if (c != null) el.append(c.nodeType ? c : document.createTextNode(String(c)));
    return el;
  }
  const nf = new Intl.NumberFormat("en-US");
  const fmt = (n) => (n >= 10000 ? new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n) : nf.format(n));
  const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  function hexToRgb(hex) {
    const m = hex.replace("#", "");
    const n = parseInt(m.length === 3 ? m.replace(/./g, "$&$&") : m, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(a, b, t) {
    const A = hexToRgb(a), B = hexToRgb(b);
    return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join("");
  }
  // Diverging color for a net score in -100..100.
  function divergingColor(net, span = 30) {
    const t = Math.max(-1, Math.min(1, net / span));
    return t >= 0 ? mix(cssVar("--mid"), cssVar("--pos"), t) : mix(cssVar("--mid"), cssVar("--neg"), -t);
  }
  function inkOn(hex) {
    const [r, g, b] = hexToRgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return L > 0.33 ? "#0b0b0b" : "#ffffff";
  }
  function ago(iso) {
    if (!iso) return "";
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
    if (s < 86400) return `${Math.round(s / 3600)}h ago`;
    return `${Math.round(s / 86400)}d ago`;
  }
  const overall = (c) => Math.round((c.press.net + c.public.net) / 2);
  const volume = (c) => c.press.total + c.public.total;

  // ---------- Tooltip ----------
  function showTip(evt, title, rows) {
    tooltip.replaceChildren(
      h("div", { class: "tt-title" }, title),
      ...rows.map(([label, value, color]) =>
        h("div", { class: "tt-row" },
          h("span", null, color ? h("i", { class: "key", style: { background: color } }) : null, label),
          h("b", null, value)))
    );
    tooltip.hidden = false;
    moveTip(evt);
  }
  function moveTip(evt) {
    let x, y;
    if (evt && "clientX" in evt && evt.clientX) { x = evt.clientX; y = evt.clientY; }
    else { const r = evt.target.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top; }
    const tw = tooltip.offsetWidth, th = tooltip.offsetHeight;
    let left = x + 14, top = y - th - 12;
    if (left + tw > innerWidth - 8) left = x - tw - 14;
    if (top < 8) top = y + 18;
    tooltip.style.left = `${Math.max(8, left)}px`;
    tooltip.style.top = `${top}px`;
  }
  const hideTip = () => { tooltip.hidden = true; };

  // ---------- Data ----------
  async function load(win) {
    if (state.cache[win]) return state.cache[win];
    try {
      const res = await fetch(`/api/sentiment?window=${win}`, { headers: { Accept: "application/json" } });
      if (!res.ok || !(res.headers.get("content-type") || "").includes("json")) throw new Error("api unavailable");
      const data = await res.json();
      if (!data.companies) throw new Error("bad payload");
      const empty = !data.companies.some((c) => volume(c) > 0);
      if (empty) throw new Error("no data");
      return (state.cache[win] = data);
    } catch (e) {
      const res = await fetch("/sentiment/sample.json");
      const data = await res.json();
      data.window = win;
      return (state.cache[win] = data);
    }
  }

  async function refresh() {
    main.classList.add("loading");
    syncWindowButtons();
    const data = await load(state.window);
    state.data = data;
    if (!state.selected || !data.companies.find((c) => c.id === state.selected)) {
      state.selected = [...data.companies].sort((a, b) => volume(b) - volume(a))[0].id;
    }
    render();
    main.classList.remove("loading");
  }

  function syncUrl() {
    const p = new URLSearchParams();
    if (state.window !== "7d") p.set("w", state.window);
    if (state.selected) p.set("c", state.selected);
    history.replaceState(null, "", `${location.pathname}${p.toString() ? "?" + p : ""}`);
  }

  // ---------- Render ----------
  function render() {
    const d = state.data;
    $("sampleBanner").hidden = !d.sample;
    $("updated").textContent = d.sample ? "Sample data" : `Updated ${ago(d.generatedAt)}`;
    renderSources(d.sources, d.sample);
    renderTiles(d.companies);
    renderMap(d.companies);
    renderMapTable(d.companies);
    const order = [...d.companies].sort((a, b) => volume(b) - volume(a));
    renderBars($("pressBars"), order, "press", "articles");
    renderBars($("publicBars"), order, "public", "posts");
    renderBarLegend();
    renderDetail();
    syncUrl();
  }

  function renderSources(sources, sample) {
    const el = $("sources");
    el.replaceChildren(...Object.values(sources || {}).map((src) => {
      const cls = sample ? "idle" : src.failed === 0 ? "" : src.ok === 0 ? "down" : "partial";
      const title = src.error ? `${src.label}: ${src.error}` : `${src.label}: ${fmt(src.items)} items`;
      const state = cls === "idle" ? "not connected" : cls === "down" ? "unavailable" : cls === "partial" ? "partial" : "live";
      return h("span", { class: `src ${cls}`, title }, h("i", { "aria-hidden": "true" }), `${src.label}`,
        h("span", { class: "visually-hidden", style: { position: "absolute", left: "-9999px" } }, ` (${state})`));
    }));
  }

  function tile(label, value, note) {
    return h("div", { class: "tile" },
      h("div", { class: "tile-label" }, label),
      h("div", { class: "tile-value", title: typeof value === "string" ? value : null }, value),
      note ? h("div", { class: "tile-note" }, note) : null);
  }

  function renderTiles(companies) {
    const press = companies.reduce((a, c) => a + c.press.total, 0);
    const pub = companies.reduce((a, c) => a + c.public.total, 0);
    const withPublic = companies.filter((c) => c.public.total > 0);
    const byVol = [...companies].sort((a, b) => b.press.total - a.press.total)[0];
    const warm = [...withPublic].sort((a, b) => b.public.net - a.public.net)[0];
    const cool = [...withPublic].sort((a, b) => a.public.net - b.public.net)[0];
    const share = press ? pct(byVol.press.total, press) : 0;
    $("tiles").replaceChildren(
      tile("Mentions analyzed", fmt(press + pub), `${fmt(press)} articles · ${fmt(pub)} posts`),
      tile("Most covered", byVol.name, `${share}% of all press`),
      tile("Warmest press", [...companies].sort((a, b) => b.press.net - a.press.net)[0].name,
        `net ${signed([...companies].sort((a, b) => b.press.net - a.press.net)[0].press.net)}`),
      tile("Warmest public", warm ? warm.name : "—", warm ? `net ${signed(warm.public.net)}` : ""),
      tile("Coolest public", cool ? cool.name : "—", cool ? `net ${signed(cool.public.net)}` : ""),
    );
  }

  // ----- The sentiment map -----
  function renderMap(companies) {
    const wrap = $("mapWrap");
    const W = Math.max(300, wrap.clientWidth);
    const narrow = W < 560;
    const H = Math.round(narrow ? W * 1.05 : Math.max(340, Math.min(600, W * 0.55)));
    const m = { t: 20, r: narrow ? 14 : 24, b: 44, l: narrow ? 30 : 48 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;

    const extent = (vals) => Math.max(30, Math.ceil((Math.max(...vals.map(Math.abs)) + 8) / 10) * 10);
    const xMax = extent(companies.map((c) => c.press.net));
    const yMax = extent(companies.map((c) => c.public.net));
    const x = (v) => m.l + ((v + xMax) / (2 * xMax)) * pw;
    const y = (v) => m.t + ph - ((v + yMax) / (2 * yMax)) * ph;
    const maxVol = Math.max(1, ...companies.map(volume));
    const rMax = Math.min(pw, ph) * (narrow ? 0.075 : 0.1), rMin = narrow ? 7 : 12;
    const r = (v) => rMin + (rMax - rMin) * Math.sqrt(v / maxVol);

    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img",
      "aria-label": "Bubble map of press sentiment versus public sentiment per company" });

    // Grid + quadrant tint
    const g = s("g");
    for (const t of [-xMax, -xMax / 2, xMax / 2, xMax]) g.append(s("line", { class: "grid-line", x1: x(t), x2: x(t), y1: m.t, y2: m.t + ph }));
    for (const t of [-yMax, -yMax / 2, yMax / 2, yMax]) g.append(s("line", { class: "grid-line", x1: m.l, x2: m.l + pw, y1: y(t), y2: y(t) }));
    g.append(s("line", { class: "axis-line", x1: x(0), x2: x(0), y1: m.t, y2: m.t + ph }));
    g.append(s("line", { class: "axis-line", x1: m.l, x2: m.l + pw, y1: y(0), y2: y(0) }));
    svg.append(g);

    // Quadrant names
    {
      const pad = 12;
      const q = [
        ["Loved all round", m.l + pw - pad, m.t + pad + 12, "end"],
        ["Public fans, press critics", m.l + pad, m.t + pad + 12, "start"],
        ["Press darlings, public skeptics", m.l + pw - pad, m.t + ph - pad, "end"],
        ["Under fire", m.l + pad, m.t + ph - pad, "start"],
      ];
      for (const [label, qx, qy, anchor] of q) {
        svg.append(s("text", { class: "quad-label", x: qx, y: qy, "text-anchor": anchor, style: narrow ? "font-size:13px" : null }, label));
      }
    }

    // Ticks
    for (const t of [-xMax, 0, xMax]) svg.append(s("text", { class: "tick", x: x(t), y: m.t + ph + 16, "text-anchor": t === -xMax ? "start" : t === xMax ? "end" : "middle" }, signed(t)));
    for (const t of [-yMax, 0, yMax]) svg.append(s("text", { class: "tick", x: m.l - 6, y: y(t) + (t === yMax ? 9 : t === -yMax ? -2 : 4), "text-anchor": "end" }, signed(t)));
    svg.append(s("text", { class: "axis-label", x: m.l + pw / 2, y: H - 6, "text-anchor": "middle" }, "Press sentiment (net) →"));
    svg.append(s("text", { class: "axis-label", transform: `translate(${narrow ? 10 : 14} ${m.t + ph / 2}) rotate(-90)`, "text-anchor": "middle" }, "Public sentiment (net) →"));

    // Bubbles, largest first so small ones stay on top.
    const nodes = companies.map((c) => ({ c, cx: x(c.press.net), cy: y(c.public.net), r: r(volume(c)), color: divergingColor(overall(c)) }))
      .sort((a, b) => b.r - a.r);

    const placed = []; // label boxes for collision checks
    const hitsBubble = (b, self) => nodes.some((o) => o !== self &&
      Math.hypot(Math.max(b.x1, Math.min(o.cx, b.x2)) - o.cx, Math.max(b.y1, Math.min(o.cy, b.y2)) - o.cy) < o.r);
    const overlaps = (b, self) => hitsBubble(b, self) || placed.some((p) => !(b.x2 < p.x1 || b.x1 > p.x2 || b.y2 < p.y1 || b.y1 > p.y2)) ||
      b.x1 < m.l || b.x2 > m.l + pw || b.y1 < m.t || b.y2 > m.t + ph;

    const layer = s("g");
    const labels = s("g");
    for (const n of nodes) {
      const { c } = n;
      const grp = s("g", {
        class: `bubble${c.id === state.selected ? " selected" : ""}`, tabindex: 0, role: "button",
        "aria-label": `${c.name}: press net ${signed(c.press.net)} from ${c.press.total} articles, public net ${signed(c.public.net)} from ${c.public.total} posts`,
        onclick: () => select(c.id),
        onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(c.id); } },
        onpointermove: (e) => tipFor(e, c),
        onpointerleave: hideTip, onfocus: (e) => tipFor(e, c), onblur: hideTip,
      });
      grp.append(s("circle", { cx: n.cx, cy: n.cy, r: Math.max(n.r, 14) + 4, fill: "transparent" })); // hit area
      grp.append(s("circle", { class: "fill", cx: n.cx, cy: n.cy, r: n.r, fill: n.color }));
      layer.append(grp);

      // Label: inside if it fits, else try below / above / right / left.
      const fs = 13, tw = c.name.length * fs * 0.6;
      if (n.r * 2 > tw + 12) {
        labels.append(s("text", { class: "bubble-name inside", x: n.cx, y: n.cy + 4.5, "text-anchor": "middle", fill: inkOn(n.color), style: `fill:${inkOn(n.color)}` }, c.name));
      } else {
        const opts = [
          { x: n.cx, y: n.cy + n.r + 15, a: "middle" },
          { x: n.cx, y: n.cy - n.r - 7, a: "middle" },
          { x: n.cx + n.r + 6, y: n.cy + 4.5, a: "start" },
          { x: n.cx - n.r - 6, y: n.cy + 4.5, a: "end" },
        ];
        const box = (o) => {
          const x1 = o.a === "middle" ? o.x - tw / 2 : o.a === "start" ? o.x : o.x - tw;
          return { x1, x2: x1 + tw, y1: o.y - 11, y2: o.y + 3 };
        };
        const pick = opts.find((o) => !overlaps(box(o), n)) || opts.find((o) => !placed.some((p) => { const b = box(o); return !(b.x2 < p.x1 || b.x1 > p.x2 || b.y2 < p.y1 || b.y1 > p.y2); })) || opts[0];
        placed.push(box(pick));
        labels.append(s("text", { class: "bubble-name", x: pick.x, y: pick.y, "text-anchor": pick.a }, c.name));
      }
    }
    svg.append(layer, labels);
    wrap.replaceChildren(svg);

    // Legend: color ramp + size key
    const nice = (v) => { const p = 10 ** Math.floor(Math.log10(Math.max(1, v))); return Math.max(1, Math.round(v / p) * p); };
    const small = nice(maxVol / 10), big = nice(maxVol / 2);
    $("mapLegend").replaceChildren(
      h("span", null, "Overall tone", h("span", { class: "ramp", "aria-hidden": "true" }), "negative → positive"),
      h("span", { class: "size-key" }, "Mentions",
        sizeKey(r(small)), fmt(small), sizeKey(r(big)), fmt(big))
    );
  }
  function sizeKey(rad) {
    const d = rad * 2;
    return s("svg", { width: d, height: d, viewBox: `0 0 ${d} ${d}`, "aria-hidden": "true" },
      s("circle", { cx: rad, cy: rad, r: rad - 1, fill: "none", stroke: cssVar("--ink-3"), "stroke-width": 1 }));
  }
  function tipFor(e, c) {
    showTip(e, c.name, [
      ["Press net", signed(c.press.net), cssVar("--ink-2")],
      ["Articles", fmt(c.press.total)],
      ["Public net", signed(c.public.net), cssVar("--ink-2")],
      ["Posts", fmt(c.public.total)],
    ]);
  }

  function renderMapTable(companies) {
    const rows = [...companies].sort((a, b) => volume(b) - volume(a));
    const table = h("table", null,
      h("thead", null, h("tr", null, ...["Company", "Articles", "Press +", "Press −", "Press net", "Posts", "Public +", "Public −", "Public net"].map((t) => h("th", { scope: "col" }, t)))),
      h("tbody", null, ...rows.map((c) => h("tr", null,
        h("td", null, c.name), h("td", null, fmt(c.press.total)), h("td", null, fmt(c.press.pos)), h("td", null, fmt(c.press.neg)),
        h("td", null, signed(c.press.net)), h("td", null, fmt(c.public.total)), h("td", null, fmt(c.public.pos)),
        h("td", null, fmt(c.public.neg)), h("td", null, signed(c.public.net)))))
    );
    $("mapTable").replaceChildren(table);
  }

  // ----- Diverging stacked bars -----
  function renderBars(el, order, key, unit) {
    const M = Math.max(1, ...order.map((c) => Math.max(c[key].neg + c[key].neu / 2, c[key].pos + c[key].neu / 2)));
    const P = (n) => (n / M) * 50; // percent of track
    const colors = { pos: cssVar("--pos"), neu: cssVar("--neu"), neg: cssVar("--neg") };
    el.replaceChildren(...order.map((c) => {
      const t = c[key];
      const half = P(t.neu / 2);
      const track = h("div", { class: "bar-track" });
      if (t.neu) track.append(h("span", { class: "seg-bar neu", style: { left: `${50 - half}%`, width: `${half * 2}%` } }));
      if (t.neg) track.append(h("span", { class: "seg-bar neg", style: { left: `${50 - half - P(t.neg)}%`, width: `calc(${P(t.neg)}% - ${t.neu ? 2 : 0}px)` } }));
      if (t.pos) track.append(h("span", { class: "seg-bar pos", style: { left: `calc(${50 + half}% + ${t.neu ? 2 : 0}px)`, width: `calc(${P(t.pos)}% - ${t.neu ? 2 : 0}px)` } }));
      const row = h("div", {
        class: `bar-row${c.id === state.selected ? " selected" : ""}`, tabindex: 0, role: "button",
        "aria-label": `${c.name}: ${t.total} ${unit}, ${t.pos} positive, ${t.neu} neutral, ${t.neg} negative, net ${signed(t.net)}`,
        onclick: () => select(c.id),
        onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(c.id); } },
        onpointermove: (e) => showTip(e, c.name, [
          ["Positive", `${fmt(t.pos)} · ${pct(t.pos, t.total)}%`, colors.pos],
          ["Neutral", `${fmt(t.neu)} · ${pct(t.neu, t.total)}%`, colors.neu],
          ["Negative", `${fmt(t.neg)} · ${pct(t.neg, t.total)}%`, colors.neg],
          ["Net", signed(t.net)],
        ]),
        onpointerleave: hideTip,
      },
        h("span", { class: "bar-name" }, c.name), track, h("span", { class: "bar-total" }, fmt(t.total)));
      return row;
    }),
    h("div", { class: "bar-axis", "aria-hidden": "true" }, h("span"), h("div", null, h("span", null, fmt(Math.round(M))), h("span", null, "0"), h("span", null, fmt(Math.round(M)))), h("span", { style: { textAlign: "right" } }, unit)));
  }
  function renderBarLegend() {
    $("barLegend").replaceChildren(
      ...[["Negative", "--neg"], ["Neutral", "--neu"], ["Positive", "--pos"]].map(([l, v]) =>
        h("span", null, h("span", { class: "sw", style: { background: `var(${v})` } }), l))
    );
  }

  // ----- Company detail -----
  function netTile(label, net, total, unit) {
    return tile(label, h("span", { class: "net-pill" }, h("i", { style: { background: divergingColor(net) } }), signed(net)),
      `${fmt(total)} ${unit}`);
  }

  function itemList(items, empty) {
    if (!items.length) return h("ul", { class: "feed" }, h("li", null, h("span"), h("span", { class: "empty" }, empty)));
    return h("ul", { class: "feed" }, ...items.slice(0, 6).map((it) => {
      const text = it.title && it.source === "news" ? it.title : it.text;
      const meta = [it.outlet, ago(it.date), it.engagement ? `${fmt(it.engagement)} engagement` : null, `tone ${it.score > 0 ? "+" : ""}${it.score.toFixed(2)}`].filter(Boolean).join(" · ");
      const body = it.url && it.url !== "#"
        ? h("a", { href: it.url, target: "_blank", rel: "noopener noreferrer" }, text)
        : h("span", { class: "feed-text" }, text);
      return h("li", null, h("span", { class: `dot ${it.label}`, title: it.label }), h("div", null, body, h("div", { class: "meta" }, meta)));
    }));
  }

  function sortItems(items, tab) {
    const list = [...items];
    if (tab === "pos") return list.filter((i) => i.label === "positive").sort((a, b) => b.score - a.score);
    if (tab === "neg") return list.filter((i) => i.label === "negative").sort((a, b) => a.score - b.score);
    if (tab === "top") return list.sort((a, b) => (b.engagement || 0) - (a.engagement || 0));
    return list.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }

  function tabs(current, options, onPick) {
    return h("div", { class: "feed-tabs", role: "tablist" }, ...options.map(([k, label]) =>
      h("button", { role: "tab", "aria-selected": String(k === current), onclick: () => onPick(k) }, label)));
  }

  function renderDetail() {
    const d = state.data;
    const c = d.companies.find((x) => x.id === state.selected);
    const el = $("detail");
    const picker = h("div", { class: "company-picker", role: "group", "aria-label": "Choose company" },
      ...d.companies.map((x) => h("button", { class: "chip", "aria-pressed": String(x.id === c.id), onclick: () => select(x.id) }, x.name)));

    const srcLabels = { reddit: "Reddit", hn: "Hacker News", bluesky: "Bluesky" };
    const split = h("div", { class: "src-split" }, ...Object.entries(c.public.bySource || {}).map(([sid, t]) =>
      h("div", { class: "mini" },
        h("div", { class: "mini-head" }, h("span", null, srcLabels[sid] || sid), h("span", null, t.total ? `${fmt(t.total)} · net ${signed(t.net)}` : "no data")),
        h("div", { class: "stack", role: "img", "aria-label": `${t.pos} positive, ${t.neu} neutral, ${t.neg} negative` },
          ...(t.total ? [["neg", t.neg], ["neu", t.neu], ["pos", t.pos]].filter(([, n]) => n).map(([k, n]) =>
            h("span", { style: { width: `${(n / t.total) * 100}%`, background: `var(--${k})` } })) : [])))));

    const pressItems = sortItems(c.press.items, state.pressTab);
    const publicItems = sortItems(c.public.items, state.publicTab);

    el.replaceChildren(
      picker,
      h("div", { class: "detail-title" }, h("h2", null, c.name), h("span", { class: "product" }, c.product)),
      h("div", { class: "detail-stats" },
        tile("Press articles", fmt(c.press.total), `${pct(c.press.total, d.companies.reduce((a, x) => a + x.press.total, 0))}% share of voice`),
        netTile("Press net", c.press.net, c.press.pos + c.press.neg, "with a clear tone"),
        tile("Public posts", fmt(c.public.total), `${pct(c.public.total, d.companies.reduce((a, x) => a + x.public.total, 0))}% of conversation`),
        netTile("Public net", c.public.net, c.public.pos + c.public.neg, "with a clear tone")),
      split,
      h("div", { class: "lists" },
        h("div", null,
          h("div", { class: "feed-col-head" }, h("h3", null, "In the press"),
            tabs(state.pressTab, [["neg", "Most negative"], ["pos", "Most positive"], ["new", "Latest"]], (k) => { state.pressTab = k; renderDetail(); })),
          itemList(pressItems, "Nothing in this slice.")),
        h("div", null,
          h("div", { class: "feed-col-head" }, h("h3", null, "What people are saying"),
            tabs(state.publicTab, [["top", "Most engaged"], ["neg", "Negative"], ["pos", "Positive"]], (k) => { state.publicTab = k; renderDetail(); })),
          itemList(publicItems, "Nothing in this slice."))),
    );
  }

  function select(id) {
    state.selected = id;
    render();
  }

  // ---------- Controls ----------
  function syncWindowButtons() {
    for (const b of $("windowSeg").querySelectorAll("button")) b.setAttribute("aria-checked", String(b.dataset.window === state.window));
  }
  $("windowSeg").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-window]");
    if (!b || b.dataset.window === state.window) return;
    state.window = b.dataset.window;
    refresh();
  });
  $("mapTableToggle").addEventListener("click", (e) => {
    const t = $("mapTable");
    t.hidden = !t.hidden;
    e.currentTarget.setAttribute("aria-expanded", String(!t.hidden));
    e.currentTarget.textContent = t.hidden ? "View as table" : "Hide table";
  });
  $("themeToggle").addEventListener("click", () => {
    const dark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === "dark"
      : matchMedia("(prefers-color-scheme: dark)").matches;
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("sentiment-theme", next); } catch (e) {}
    if (state.data) render();
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => state.data && render());
  let rt;
  addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => state.data && renderMap(state.data.companies), 120); });

  refresh();
})();
