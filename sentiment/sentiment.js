(() => {
  "use strict";

  // ---------- State ----------
  const params = new URLSearchParams(location.search);
  const WINDOWS = ["1", "3", "7", "all"];
  const state = {
    window: WINDOWS.includes(params.get("w")) ? params.get("w") : "7",
    selected: params.get("c") || null,
    raw: null,
    tab: "neg",
  };

  const $ = (id) => document.getElementById(id);
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
  const fmt = (n) => nf.format(n);
  const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const isLink = (u) => /^https?:\/\//.test(u || "");
  const tone = (v) => (v > 0 ? "+" : "") + v.toFixed(2);

  function hexToRgb(hex) {
    const m = hex.replace("#", "");
    const n = parseInt(m.length === 3 ? m.replace(/./g, "$&$&") : m, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(a, b, t) {
    const A = hexToRgb(a), B = hexToRgb(b);
    return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join("");
  }
  // Diverging color: value in [-span, span] -> red .. gray .. blue.
  function diverging(v, span) {
    const t = Math.max(-1, Math.min(1, v / span));
    return t >= 0 ? mix(cssVar("--mid"), cssVar("--pos"), t) : mix(cssVar("--mid"), cssVar("--neg"), -t);
  }
  function ago(iso) {
    if (!iso) return "";
    const sec = (Date.now() - new Date(iso).getTime()) / 1000;
    if (sec < 3600) return `${Math.max(1, Math.round(sec / 60))}m ago`;
    if (sec < 86400) return `${Math.round(sec / 3600)}h ago`;
    return `${Math.round(sec / 86400)}d ago`;
  }
  const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
  const shortDate = (iso) => (iso ? dateFmt.format(new Date(iso)) : "—");
  const trunc = (t, n) => (t.length > n ? t.slice(0, n - 1) + "…" : t);
  const onActivate = (fn) => (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } };

  function tally(list) {
    const t = { total: list.length, pos: 0, neu: 0, neg: 0, net: 0 };
    for (const a of list) t[a.label === "positive" ? "pos" : a.label === "negative" ? "neg" : "neu"]++;
    if (t.total) t.net = Math.round(((t.pos - t.neg) / t.total) * 100);
    return t;
  }

  // ---------- Tooltip ----------
  function showTip(evt, title, rows, note) {
    tooltip.replaceChildren(
      h("div", { class: "tt-title" }, title),
      ...rows.map(([label, value, color]) =>
        h("div", { class: "tt-row" },
          h("span", null, color ? h("i", { class: "key", style: { background: color } }) : null, label),
          h("b", null, value))),
      note ? h("div", { class: "tt-note" }, note) : null,
    );
    tooltip.hidden = false;
    let x, y;
    if (evt && evt.clientX) { x = evt.clientX; y = evt.clientY; }
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
  async function load() {
    try {
      const res = await fetch("/api/sentiment", { headers: { Accept: "application/json" } });
      if (!res.ok || !(res.headers.get("content-type") || "").includes("json")) throw new Error("api unavailable");
      const data = await res.json();
      if (!data.articles || !data.feeds.some((f) => f.ok)) throw new Error("no feeds");
      return data;
    } catch (e) {
      return (await fetch("/sentiment/sample.json")).json();
    }
  }

  // Everything on the page is derived from the raw articles + the chosen window.
  function view() {
    const d = state.raw;
    const cutoff = Date.now() - Number(state.window) * 86400e3;
    const articles = state.window === "all" ? d.articles
      : d.articles.filter((a) => a.date && new Date(a.date).getTime() >= cutoff);
    const companies = d.companies.map((c) => {
      const list = articles.filter((a) => a.companies.includes(c.id));
      return { ...c, articles: list, ...tally(list) };
    });
    const outlets = d.feeds.map((f) => {
      const list = articles.filter((a) => a.feed === f.id);
      return { ...f, articles: list, ...tally(list) };
    });
    return { articles, companies, outlets };
  }

  async function init() {
    $("main").classList.add("loading");
    state.raw = await load();
    $("main").classList.remove("loading");
    render();
  }

  function syncUrl() {
    const p = new URLSearchParams();
    if (state.window !== "7") p.set("w", state.window);
    if (state.selected) p.set("c", state.selected);
    history.replaceState(null, "", `${location.pathname}${p.toString() ? "?" + p : ""}${location.hash}`);
  }

  // ---------- Render ----------
  let V, order;
  function render() {
    V = view();
    order = [...V.companies].sort((a, b) => b.total - a.total);
    if (!state.selected || !V.companies.some((c) => c.id === state.selected)) state.selected = order[0].id;

    const d = state.raw;
    $("sampleBanner").hidden = !d.sample;
    const live = d.feeds.filter((f) => f.ok).length;
    $("feedStatus").replaceChildren(
      h("i", { class: d.sample ? "idle" : live === d.feeds.length ? "" : live ? "partial" : "down", "aria-hidden": "true" }),
      d.sample ? `${d.feeds.length} outlet feeds · not connected` : `${live} of ${d.feeds.length} outlet feeds live`);
    $("updated").textContent = d.sample ? "Sample data" : `Updated ${ago(d.generatedAt)}`;
    for (const b of $("windowSeg").querySelectorAll("button")) b.setAttribute("aria-checked", String(b.dataset.window === state.window));

    renderTiles();
    renderStrip();
    renderSummaryTable();
    renderToneBars();
    renderOutletBars();
    renderBarLegend();
    renderHeat();
    renderDetail();
    renderSources();
    syncUrl();
  }

  function tile(label, value, note) {
    return h("div", { class: "tile" },
      h("div", { class: "tile-label" }, label),
      h("div", { class: "tile-value", title: typeof value === "string" ? value : null }, value),
      note ? h("div", { class: "tile-note" }, note) : null);
  }

  function renderTiles() {
    const enough = V.companies.filter((c) => c.total >= 3);
    const warm = [...enough].sort((a, b) => b.net - a.net)[0];
    const cool = [...enough].sort((a, b) => a.net - b.net)[0];
    const topOutlet = [...V.outlets].sort((a, b) => b.total - a.total)[0];
    const top = order[0];
    const mentions = V.companies.reduce((a, c) => a + c.total, 0);
    $("tiles").replaceChildren(
      tile("Stories analyzed", fmt(V.articles.length), `from ${V.outlets.filter((o) => o.total).length} outlets`),
      tile("Most covered", top.total ? top.name : "—", top.total ? `${pct(top.total, mentions)}% of coverage` : ""),
      tile("Warmest coverage", warm ? warm.name : "—", warm ? `net ${signed(warm.net)}` : "not enough stories"),
      tile("Harshest coverage", cool ? cool.name : "—", cool ? `net ${signed(cool.net)}` : "not enough stories"),
      tile("Busiest outlet", topOutlet.total ? topOutlet.outlet : "—", `${fmt(topOutlet.total)} stories`),
    );
  }

  // ----- Strip chart: one row per company, one dot per story -----
  function renderStrip() {
    const wrap = $("strip");
    const W = Math.max(300, wrap.clientWidth);
    const narrow = W < 600;
    const labelW = narrow ? 80 : 150, netW = narrow ? 34 : 60;
    const rowH = 60, top = 26;
    const r = narrow ? 3.2 : 4;
    const x0 = labelW + 10, x1 = W - netW - 10;
    const x = (v) => x0 + ((v + 1) / 2) * (x1 - x0);
    const H = top + order.length * rowH + 4;

    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img",
      "aria-label": "Strip chart: every story plotted by tone, one row per company" });

    order.forEach((c, i) => {
      if (c.id !== state.selected) return;
      svg.append(s("rect", { class: "row-bg", x: 0, y: top + i * rowH + 2, width: W, height: rowH - 4, rx: 8 }));
    });
    for (const v of [-1, -0.5, 0, 0.5, 1]) {
      svg.append(s("line", { class: v === 0 ? "axis-line" : "grid-line", x1: x(v), x2: x(v), y1: top - 4, y2: H - 4 }));
    }
    svg.append(
      s("text", { class: "tick", x: x(-1), y: 14, "text-anchor": "start" }, narrow ? "← Neg" : "← Negative"),
      s("text", { class: "tick", x: x(0), y: 14, "text-anchor": "middle" }, narrow ? "0" : "Neutral"),
      s("text", { class: "tick", x: x(1), y: 14, "text-anchor": "end" }, narrow ? "Pos →" : "Positive →"),
      s("text", { class: "tick", x: W - 6, y: 14, "text-anchor": "end" }, "Net"),
    );

    const step = r * 2 + 1;
    order.forEach((c, i) => {
      const cy = top + i * rowH + rowH / 2;
      const row = s("g");
      const label = s("g", {
        class: "row-label", tabindex: 0, role: "button",
        "aria-label": `${c.name}: ${c.total} stories, ${c.pos} positive, ${c.neu} neutral, ${c.neg} negative, net ${signed(c.net)}`,
        onclick: () => select(c.id), onkeydown: onActivate(() => select(c.id)),
      });
      label.append(
        s("rect", { x: 0, y: cy - rowH / 2 + 2, width: labelW, height: rowH - 4, fill: "transparent" }),
        s("text", { class: "row-name", x: 10, y: cy - 2 }, narrow ? c.short || c.name : c.name),
        s("text", { class: "row-count", x: 10, y: cy + 14 }, `${fmt(c.total)} ${c.total === 1 ? "story" : "stories"}`),
      );
      row.append(label, s("text", { class: "row-net", x: W - 6, y: cy + 4, "text-anchor": "end" }, c.total ? signed(c.net) : "—"));

      // Beeswarm: each dot keeps its true tone (x) and stacks vertically to avoid overlap.
      // When a column is full, dots nudge sideways by the smallest step that fits.
      const maxOff = rowH / 2 - r - 3;
      const offsets = [0];
      for (let k = 1; k * step <= maxOff; k++) offsets.push(-k * step, k * step);
      const placed = [];
      const free = (px, py) => !placed.some((p) => Math.abs(p.x - px) < step && Math.abs(p.y - py) < step);
      for (const a of [...c.articles].sort((p, q) => Math.abs(p.score) - Math.abs(q.score))) {
        const px = x(a.score);
        let pos = null;
        for (let dx = 0; dx < 60 && !pos; dx += step) {
          for (const sx of dx ? [dx, -dx] : [0]) {
            if (px + sx < x0 - r || px + sx > x1 + r) continue; // never spill past the axis
            const off = offsets.find((o) => free(px + sx, cy + o));
            if (off !== undefined) { pos = { x: px + sx, y: cy + off }; break; }
          }
        }
        pos = pos || { x: px, y: cy };
        placed.push(pos);
        const tip = (e) => showTip(e, trunc(a.title, 110),
          [["Outlet", a.outlet], ["Published", a.date ? ago(a.date) : "—"], ["Tone", tone(a.score)]],
          isLink(a.url) ? "Click to open the story" : null);
        row.append(s("circle", {
          class: "dot", cx: pos.x, cy: pos.y, r, fill: diverging(a.score, 0.8),
          onpointerenter: tip, onpointermove: tip, onpointerleave: hideTip,
          onclick: () => { if (isLink(a.url)) window.open(a.url, "_blank", "noopener"); else select(c.id); },
        }));
      }
      svg.append(row);
    });
    wrap.replaceChildren(svg);

    $("stripLegend").replaceChildren(
      h("span", null, "Story tone", h("span", { class: "ramp", "aria-hidden": "true" }), "negative → positive"),
      h("span", null, "Net = % positive − % negative"),
    );
  }

  function renderSummaryTable() {
    $("summaryTable").replaceChildren(h("table", null,
      h("thead", null, h("tr", null, ...["Company", "Stories", "Positive", "Neutral", "Negative", "Net tone", "Outlets"].map((t) => h("th", { scope: "col" }, t)))),
      h("tbody", null, ...order.map((c) => h("tr", null,
        h("td", null, c.name), h("td", null, fmt(c.total)), h("td", null, fmt(c.pos)), h("td", null, fmt(c.neu)),
        h("td", null, fmt(c.neg)), h("td", null, c.total ? signed(c.net) : "—"),
        h("td", null, fmt(new Set(c.articles.map((a) => a.feed)).size)))))));
  }

  // ----- Bars -----
  function barRow(name, track, t, onPick, selected) {
    return h("div", {
      class: `bar-row${onPick ? " clickable" : ""}${selected ? " selected" : ""}`, tabindex: onPick ? 0 : null, role: onPick ? "button" : null,
      "aria-label": `${name}: ${t.total} stories, ${t.pos} positive, ${t.neu} neutral, ${t.neg} negative, net ${signed(t.net)}`,
      onclick: onPick, onkeydown: onPick ? onActivate(onPick) : null,
      onpointermove: (e) => showTip(e, name, [
        ["Positive", `${fmt(t.pos)} · ${pct(t.pos, t.total)}%`, cssVar("--pos")],
        ["Neutral", `${fmt(t.neu)} · ${pct(t.neu, t.total)}%`, cssVar("--neu")],
        ["Negative", `${fmt(t.neg)} · ${pct(t.neg, t.total)}%`, cssVar("--neg")],
        ["Net tone", t.total ? signed(t.net) : "—"],
      ]),
      onpointerleave: hideTip,
    }, h("span", { class: "bar-name", title: name }, name), track, h("span", { class: "bar-total" }, fmt(t.total)));
  }
  const toneStack = (t) => [["neg", t.neg], ["neu", t.neu], ["pos", t.pos]].filter(([, n]) => n)
    .map(([k, n]) => h("span", { class: `seg-inline ${k}`, style: { flexGrow: n } }));

  function renderToneBars() {
    const M = Math.max(1, ...order.map((c) => Math.max(c.neg + c.neu / 2, c.pos + c.neu / 2)));
    const P = (n) => (n / M) * 50;
    $("toneBars").replaceChildren(...order.map((c) => {
      const half = P(c.neu / 2), gap = c.neu ? 2 : 0;
      const track = h("div", { class: "bar-track centered" });
      if (c.neu) track.append(h("span", { class: "seg-bar neu", style: { left: `${50 - half}%`, width: `${half * 2}%` } }));
      if (c.neg) track.append(h("span", { class: "seg-bar neg", style: { left: `${50 - half - P(c.neg)}%`, width: `calc(${P(c.neg)}% - ${gap}px)` } }));
      if (c.pos) track.append(h("span", { class: "seg-bar pos", style: { left: `calc(${50 + half}% + ${gap}px)`, width: `calc(${P(c.pos)}% - ${gap}px)` } }));
      return barRow(c.name, track, c, () => select(c.id), c.id === state.selected);
    }), h("div", { class: "bar-axis", "aria-hidden": "true" }, h("span"),
      h("div", null, h("span", null, fmt(Math.round(M))), h("span", null, "0"), h("span", null, fmt(Math.round(M)))),
      h("span", { style: { textAlign: "right" } }, "stories")));
  }

  function renderOutletBars() {
    const rows = [...V.outlets].sort((a, b) => b.total - a.total);
    const M = Math.max(1, ...rows.map((o) => o.total));
    $("outletBars").replaceChildren(...rows.map((o) =>
      barRow(o.outlet, h("div", { class: "bar-track" }, h("div", { class: "hstack", style: { width: `${(o.total / M) * 100}%` } }, ...toneStack(o))), o, null, false)));
  }

  function renderBarLegend() {
    $("barLegend").replaceChildren(...[["Negative", "--neg"], ["Neutral", "--neu"], ["Positive", "--pos"]].map(([l, v]) =>
      h("span", null, h("span", { class: "sw", style: { background: `var(${v})` } }), l)));
  }

  // ----- Outlet × company heatmap -----
  function renderHeat() {
    const outlets = [...V.outlets].sort((a, b) => b.total - a.total);
    const cell = (o, c) => o.articles.filter((a) => a.companies.includes(c.id));
    let max = 1;
    for (const o of outlets) for (const c of order) max = Math.max(max, cell(o, c).length);
    const ink = cssVar("--ink"), surface = cssVar("--surface");
    const lum = (hex) => { const [r, g, b] = hexToRgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    $("heat").replaceChildren(h("table", { class: "heat" },
      h("thead", null, h("tr", null, h("th", { scope: "col" }, "Outlet"), ...order.map((c) => h("th", { scope: "col", title: c.name }, c.short || c.name)))),
      h("tbody", null, ...outlets.map((o) => h("tr", null,
        h("th", { scope: "row" }, o.outlet),
        ...order.map((c) => {
          const list = cell(o, c), n = list.length, t = tally(list);
          const alpha = n ? 0.08 + 0.72 * Math.sqrt(n / max) : 0;
          return h("td", {
            class: `${n ? "" : "zero"}${c.id === state.selected ? " sel" : ""}`,
            style: n ? (() => { const bg = mix(surface, ink, alpha); return { background: bg, color: lum(bg) > 0.22 ? "#0b0b0b" : "#f0efec" }; })() : null,
            onpointermove: (e) => showTip(e, `${o.outlet} on ${c.name}`, [["Stories", fmt(n)], ["Net tone", n ? signed(t.net) : "—"]]),
            onpointerleave: hideTip,
            onclick: () => select(c.id),
          }, n ? fmt(n) : "·");
        }))))));
  }

  // ----- Company detail -----
  function sortItems(items, tab) {
    const list = [...items];
    if (tab === "pos") return list.filter((i) => i.label === "positive").sort((a, b) => b.score - a.score);
    if (tab === "neg") return list.filter((i) => i.label === "negative").sort((a, b) => a.score - b.score);
    return list.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }

  function renderDetail() {
    const c = V.companies.find((x) => x.id === state.selected);
    const mentions = V.companies.reduce((a, x) => a + x.total, 0);
    const byOutlet = V.outlets.map((o) => ({ outlet: o.outlet, ...tally(o.articles.filter((a) => a.companies.includes(c.id))) }))
      .filter((o) => o.total).sort((a, b) => b.total - a.total);
    const maxO = Math.max(1, ...byOutlet.map((o) => o.total));
    const items = sortItems(c.articles, state.tab);

    $("detail").replaceChildren(
      h("div", { class: "company-picker", role: "group", "aria-label": "Choose company" },
        ...V.companies.map((x) => h("button", { class: "chip", "aria-pressed": String(x.id === c.id), onclick: () => select(x.id) }, x.name))),
      h("div", { class: "detail-title" }, h("h2", null, c.name), h("span", { class: "product" }, c.product)),
      h("div", { class: "detail-stats" },
        tile("Stories", fmt(c.total), `${pct(c.total, mentions)}% of all coverage`),
        tile("Net tone", h("span", { class: "net-pill" }, h("i", { style: { background: diverging(c.net, 40) } }), c.total ? signed(c.net) : "—"),
          `${fmt(c.pos)} positive · ${fmt(c.neg)} negative`),
        tile("Neutral", fmt(c.neu), `${pct(c.neu, c.total)}% of its stories`),
        tile("Outlets covering", fmt(byOutlet.length), `of ${V.outlets.length} tracked`)),
      h("div", { class: "lists" },
        h("div", null,
          h("h3", null, "By outlet"),
          byOutlet.length ? h("div", { class: "mini-bars" }, ...byOutlet.map((o) =>
            h("div", { class: "mini-row", title: `${o.outlet}: ${o.total} stories, net ${signed(o.net)}` },
              h("span", { class: "mini-name" }, o.outlet),
              h("div", { class: "mini-track" }, h("div", { class: "hstack", style: { width: `${(o.total / maxO) * 100}%` } }, ...toneStack(o))),
              h("span", { class: "mini-num" }, fmt(o.total)))))
            : h("p", { class: "empty" }, "No stories in this window.")),
        h("div", null,
          h("div", { class: "feed-col-head" }, h("h3", null, "Headlines"),
            h("div", { class: "feed-tabs", role: "tablist" }, ...[["neg", "Most negative"], ["pos", "Most positive"], ["new", "Latest"]].map(([k, l]) =>
              h("button", { role: "tab", "aria-selected": String(k === state.tab), onclick: () => { state.tab = k; renderDetail(); } }, l)))),
          items.length ? h("ul", { class: "feed" }, ...items.slice(0, 8).map((a) =>
            h("li", null, h("span", { class: `dot-key ${a.label}`, title: a.label }),
              h("div", null,
                isLink(a.url) ? h("a", { href: a.url, target: "_blank", rel: "noopener noreferrer" }, a.title) : h("span", null, a.title),
                h("div", { class: "meta" }, [a.outlet, a.date ? ago(a.date) : null, `tone ${tone(a.score)}`].filter(Boolean).join(" · "))))))
            : h("p", { class: "empty" }, "Nothing in this slice."))),
    );
  }

  // ----- Sources -----
  function renderSources() {
    const sample = state.raw.sample;
    $("sourceTable").replaceChildren(h("table", { class: "sources-table" },
      h("thead", null, h("tr", null, ...["Outlet", "Section", "Feed", "Status", "Stories in feed", "About these companies", "Goes back to"].map((t) => h("th", { scope: "col" }, t)))),
      h("tbody", null, ...state.raw.feeds.map((f) => h("tr", null,
        h("td", null, h("a", { href: f.home, target: "_blank", rel: "noopener noreferrer" }, f.outlet)),
        h("td", null, f.section),
        h("td", null, h("a", { class: "feed-link", href: f.url, target: "_blank", rel: "noopener noreferrer", title: f.url }, "RSS ↗")),
        h("td", null, h("span", { class: `status ${sample ? "idle" : f.ok ? "ok" : "down"}` }, h("i", { "aria-hidden": "true" }),
          sample ? "Not connected" : f.ok ? "Live" : `Failed (${f.error})`)),
        h("td", null, sample ? "—" : fmt(f.stories)),
        h("td", null, sample ? "—" : fmt(f.matched)),
        h("td", null, sample ? "—" : shortDate(f.oldest)))))));
  }

  function select(id) {
    state.selected = id;
    hideTip();
    render();
  }

  // ---------- Controls ----------
  $("windowSeg").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-window]");
    if (!b || b.dataset.window === state.window) return;
    state.window = b.dataset.window;
    render();
  });
  $("tableToggle").addEventListener("click", (e) => {
    const t = $("summaryTable");
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
    if (state.raw) render();
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => state.raw && render());
  let rt;
  addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => state.raw && renderStrip(), 120); });

  init();
})();
