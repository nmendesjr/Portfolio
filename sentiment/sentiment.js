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
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const still = () => reduceMotion.matches;

  // ---------- Helpers ----------
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "style") typeof v === "string" ? (el.style.cssText = v) : Object.assign(el.style, v);
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
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const reflow = (el) => el.getBoundingClientRect();

  function hexToRgb(hex) {
    const m = hex.replace("#", "");
    const n = parseInt(m.length === 3 ? m.replace(/./g, "$&$&") : m, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(a, b, t) {
    const A = hexToRgb(a), B = hexToRgb(b);
    return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join("");
  }
  function lum(hex) {
    const [r, g, b] = hexToRgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  // Diverging color: value in [-span, span] -> red .. gray .. blue.
  function diverging(v, span) {
    const t = clamp(v / span, -1, 1);
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
  function niceRound(v) {
    const p = 10 ** Math.floor(Math.log10(Math.max(1, v)));
    return Math.max(1, Math.round(v / p) * p);
  }

  function tally(list) {
    const t = { total: list.length, pos: 0, neu: 0, neg: 0, net: 0 };
    for (const a of list) t[a.label === "positive" ? "pos" : a.label === "negative" ? "neg" : "neu"]++;
    if (t.total) t.net = Math.round(((t.pos - t.neg) / t.total) * 100);
    return t;
  }

  // ---------- Motion helpers ----------
  // Run `play` once the element scrolls into view (or after a short fallback,
  // so nothing is ever left in its pre-animation state).
  const played = new Set();
  function whenVisible(key, el, play) {
    if (still() || played.has(key)) { play(); return; }
    let done = false;
    const go = () => {
      if (done) return;
      done = true; played.add(key); io.disconnect(); clearTimeout(timer);
      requestAnimationFrame(() => requestAnimationFrame(play));
    };
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) go(); }, { threshold: 0.18 });
    io.observe(el);
    // Fallback for contexts where the observer never fires (e.g. static captures).
    const timer = setTimeout(go, 15000);
  }
  // Arm a CSS entrance (".armed" = start state, ".play" = run it).
  function entrance(key, el) {
    if (still() || played.has(key)) return;
    el.classList.remove("play");
    el.classList.add("armed");
    whenVisible(key, el, () => {
      el.classList.add("play");
      // Let go once it has run, so later re-renders and hover effects aren't affected.
      setTimeout(() => el.classList.remove("armed", "play"), 2200);
    });
  }
  function countUp(el, to, dur = 1100) {
    if (still()) { el.textContent = fmt(to); return; }
    const t0 = performance.now();
    const step = (t) => {
      const p = clamp((t - t0) / dur, 0, 1), e = 1 - (1 - p) ** 4;
      el.textContent = fmt(Math.round(to * e));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ---------- Tooltip ----------
  function showTip(evt, title, rows, note) {
    tooltip.replaceChildren(
      h("div", { class: "tt-title" }, title),
      ...rows.map(([label, value, color]) =>
        h("div", { class: "tt-row" },
          h("span", null, color ? h("i", { class: "key", style: { background: color } }) : null, label),
          h("b", null, value))),
      ...(note ? [h("div", { class: "tt-note" }, note)] : []),
    );
    tooltip.classList.add("show");
    let x, y;
    if (evt && evt.clientX) { x = evt.clientX; y = evt.clientY; }
    else { const r = evt.target.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top; }
    const tw = tooltip.offsetWidth, th = tooltip.offsetHeight;
    let left = x + 16, top = y - th - 14;
    if (left + tw > innerWidth - 8) left = x - tw - 16;
    if (top < 8) top = y + 20;
    tooltip.style.left = `${Math.max(8, left)}px`;
    tooltip.style.top = `${top}px`;
  }
  const hideTip = () => tooltip.classList.remove("show");

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
    document.documentElement.classList.add("js");
    $("main").classList.add("loading");
    state.raw = await load();
    $("main").classList.remove("loading");
    render({ intro: true });
    // Button widths change when the web font arrives; re-measure the sliding pill.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(moveSegThumb);
  }

  function syncUrl() {
    const p = new URLSearchParams();
    if (state.window !== "7") p.set("w", state.window);
    if (state.selected) p.set("c", state.selected);
    history.replaceState(null, "", `${location.pathname}${p.toString() ? "?" + p : ""}${location.hash}`);
  }

  // ---------- Render ----------
  // intro: first paint (entrances play). replay: window changed (charts re-animate).
  let V, order;
  function render(opts = {}) {
    V = view();
    order = [...V.companies].sort((a, b) => b.total - a.total);
    if (!state.selected || !V.companies.some((c) => c.id === state.selected)) state.selected = order[0].id;
    if (opts.replay) for (const k of ["strip", "tone", "outlets", "heat"]) played.delete(k);

    const d = state.raw;
    $("sampleBanner").hidden = !d.sample;
    const live = d.feeds.filter((f) => f.ok).length;
    $("feedStatus").replaceChildren(
      h("i", { class: d.sample ? "idle" : live === d.feeds.length ? "live" : live ? "partial" : "down", "aria-hidden": "true" }),
      d.sample ? `${d.feeds.length} outlet feeds · not connected` : `${live} of ${d.feeds.length} outlet feeds live`);
    $("updated").textContent = d.sample ? "Sample data" : `Updated ${ago(d.generatedAt)}`;
    for (const b of $("windowSeg").querySelectorAll("button")) b.setAttribute("aria-checked", String(b.dataset.window === state.window));
    moveSegThumb();

    renderTiles(opts);
    renderBubbles(opts);
    renderStrip(opts);
    renderSummaryTable();
    renderToneBars();
    renderOutletBars();
    renderBarLegend();
    renderHeat();
    renderDetail(opts);
    renderSources();
    syncUrl();
  }

  function tile(label, value, note, i = 0) {
    return h("div", { class: "tile", style: `--i:${i}` },
      h("div", { class: "tile-label" }, label),
      h("div", { class: "tile-value", title: typeof value === "string" ? value : null }, value),
      note ? h("div", { class: "tile-note" }, note) : null);
  }

  function renderTiles(opts) {
    const enough = V.companies.filter((c) => c.total >= 3);
    const warm = [...enough].sort((a, b) => b.net - a.net)[0];
    const cool = [...enough].sort((a, b) => a.net - b.net)[0];
    const topOutlet = [...V.outlets].sort((a, b) => b.total - a.total)[0];
    const top = order[0];
    const mentions = V.companies.reduce((a, c) => a + c.total, 0);
    const count = h("span", null, fmt(V.articles.length));
    $("tiles").replaceChildren(
      tile("Stories analyzed", count, `from ${V.outlets.filter((o) => o.total).length} outlets`, 0),
      tile("Most covered", top.total ? top.name : "—", top.total ? `${pct(top.total, mentions)}% of coverage` : "", 1),
      tile("Warmest coverage", warm ? warm.name : "—", warm ? `net ${signed(warm.net)}` : "not enough stories", 2),
      tile("Harshest coverage", cool ? cool.name : "—", cool ? `net ${signed(cool.net)}` : "not enough stories", 3),
      tile("Busiest outlet", topOutlet.total ? topOutlet.outlet : "—", `${fmt(topOutlet.total)} stories`, 4),
    );
    if (opts.intro || opts.replay) countUp(count, V.articles.length);
  }

  // ----- Bubble chart: x = net tone, area = number of stories -----
  // Each bubble is layered so different motions never fight:
  //   .b-pos (data position, slow spring) > .b-mag (cursor push, quick)
  //   > .b-float (idle bob) > .b-pop (hover scale) > .b-scale (radius)
  let bubblePos = new Map();
  let bubbleNodes = [];
  function renderBubbles(opts) {
    const wrap = $("bubbles");
    const W = Math.max(300, wrap.clientWidth);
    const narrow = W < 600;
    const H = narrow ? 380 : 460;
    const m = { t: 30, r: 12, b: 40, l: 12 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b, cy0 = m.t + ph / 2, axisY = m.t + ph;
    const live = order.filter((c) => c.total > 0);
    const xMax = Math.max(40, Math.ceil((Math.max(0, ...live.map((c) => Math.abs(c.net))) + 12) / 10) * 10);
    const x = (v) => m.l + ((v + xMax) / (2 * xMax)) * pw;
    const maxN = Math.max(1, ...live.map((c) => c.total));
    const rMax = Math.min(ph * 0.17, pw * (narrow ? 0.12 : 0.07)), rMin = narrow ? 9 : 12;
    const rad = (n) => rMin + (rMax - rMin) * Math.sqrt(n / maxN);
    const mentions = V.companies.reduce((a, c) => a + c.total, 0);

    const svg = s("svg", { class: "bubble-svg", viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img",
      "aria-label": "Bubble chart: each company placed by net tone of coverage, sized by number of stories" });

    // Background: a soft tone wash, red on the left, blue on the right.
    const gid = "toneWash";
    svg.append(s("defs", null,
      s("linearGradient", { id: gid, x1: "0", x2: "1", y1: "0", y2: "0" },
        s("stop", { offset: "0%", "stop-color": cssVar("--neg"), "stop-opacity": "0.10" }),
        s("stop", { offset: "50%", "stop-color": cssVar("--mid"), "stop-opacity": "0" }),
        s("stop", { offset: "100%", "stop-color": cssVar("--pos"), "stop-opacity": "0.10" }))));
    svg.append(s("rect", { class: "wash", x: m.l, y: m.t - 8, width: pw, height: ph + 8, rx: 12, fill: `url(#${gid})` }));

    for (const t of [-xMax, -xMax / 2, 0, xMax / 2, xMax]) {
      svg.append(s("line", { class: t === 0 ? "axis-line" : "grid-line", x1: x(t), x2: x(t), y1: m.t - 8, y2: axisY }));
      svg.append(s("text", { class: "tick", x: x(t), y: H - 20, "text-anchor": t === -xMax ? "start" : t === xMax ? "end" : "middle" }, t === 0 ? "0" : signed(t)));
    }
    svg.append(
      s("text", { class: "tick", x: m.l, y: 14, "text-anchor": "start" }, narrow ? "← More negative" : "← More negative coverage"),
      s("text", { class: "tick", x: x(0), y: 14, "text-anchor": "middle" }, "Neutral"),
      s("text", { class: "tick", x: W - m.r, y: 14, "text-anchor": "end" }, narrow ? "More positive →" : "More positive coverage →"),
      s("text", { class: "axis-label", x: m.l + pw / 2, y: H - 2, "text-anchor": "middle" }, "Net tone (% positive − % negative)"),
    );

    // Place biggest first; each keeps its true x and moves vertically only to avoid overlap.
    const nodes = live.map((c) => ({ c, x: x(c.net), r: rad(c.total) })).sort((a, b) => b.r - a.r);
    const placed = [];
    for (const n of nodes) {
      const lo = m.t + n.r, hi = m.t + ph - n.r;
      let best = null, bestOverlap = Infinity, bestY = cy0;
      for (let k = 0; k < 600 && best == null; k++) {
        const y = cy0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 2;
        if (y < lo || y > hi) continue;
        const overlap = placed.reduce((a, p) => a + Math.max(0, p.r + n.r + 3 - Math.hypot(p.x - n.x, p.y - y)), 0);
        if (overlap === 0) best = y;
        else if (overlap < bestOverlap) { bestOverlap = overlap; bestY = y; }
      }
      n.y = best ?? bestY;
      placed.push(n);
    }

    // Label placement (relative to each bubble's centre so labels travel with it).
    const boxes = [];
    const hit = (b, self) => boxes.some((p) => !(b.x2 < p.x1 || b.x1 > p.x2 || b.y2 < p.y1 || b.y1 > p.y2)) ||
      placed.some((p) => Math.hypot(Math.max(b.x1, Math.min(p.x, b.x2)) - p.x, Math.max(b.y1, Math.min(p.y, b.y2)) - p.y) < p.r + (p === self ? 0 : 10)) ||
      b.x1 < 0 || b.x2 > W;

    const guide = s("g", { class: "guide" });
    const layer = s("g", { class: "bubbles" }), labels = s("g", { class: "labels" });
    const next = new Map();
    const intro = !played.has("bubbles");

    placed.forEach((n, i) => {
      const { c } = n;
      const fill = diverging(c.net, 40);
      const prev = bubblePos.get(c.id);
      const start = prev || { x: n.x, y: axisY + 30, r: 0.001 };
      const dur = 3.6 + ((i * 0.73) % 1.8), delay = -((i * 1.31) % 3);
      const posStyle = (p) => `transform: translate(${p.x}px, ${p.y}px)`;
      const stagger = intro ? `transition-delay:${i * 90}ms` : "";

      const scale = s("g", { class: "b-scale", style: `transform: scale(${start.r});${stagger}` },
        s("circle", { class: "halo", r: 1, fill }),
        s("circle", { class: "fill", r: 1, fill }));
      const pop = s("g", { class: "b-pop" }, scale);
      const float = s("g", { class: "b-float", style: `animation-duration:${dur}s;animation-delay:${delay}s` }, pop);
      const mag = s("g", { class: "b-mag" }, s("circle", { class: "hit", r: Math.max(n.r, 14) + 6 }), float);
      const g = s("g", {
        class: `bubble${c.id === state.selected ? " selected" : ""}`, tabindex: 0, role: "button",
        style: `${posStyle(start)};${stagger}`,
        "aria-label": `${c.name}: ${c.total} stories, net tone ${signed(c.net)}`,
        onclick: () => select(c.id), onkeydown: onActivate(() => select(c.id)),
        onpointerenter: (e) => heat(n, true, e), onpointermove: (e) => tip(e, c), onpointerleave: () => heat(n, false),
        onfocus: (e) => { heat(n, true, e); tip(e, c); }, onblur: () => heat(n, false),
      }, mag);
      layer.append(g);

      // Label
      const name = narrow ? c.short || c.name : c.name;
      const tw = name.length * 13 * 0.6;
      const lfloat = s("g", { class: "b-float", style: `animation-duration:${dur}s;animation-delay:${delay}s` });
      if (n.r * 2 > tw + 14 && n.r > 22) {
        const ink = lum(fill) > 0.3 ? "#0b0b0b" : "#ffffff";
        lfloat.append(s("g", { class: "b-pop" },
          s("text", { class: "bubble-name inside", x: 0, y: 1, "text-anchor": "middle", style: `fill:${ink}` }, name),
          s("text", { class: "bubble-count", x: 0, y: 16, "text-anchor": "middle", style: `fill:${ink}` }, fmt(c.total))));
      } else {
        const opts2 = [
          { x: n.x, y: n.y + n.r + 15, a: "middle" }, { x: n.x, y: n.y - n.r - 7, a: "middle" },
          { x: n.x + n.r + 6, y: n.y + 4, a: "start" }, { x: n.x - n.r - 6, y: n.y + 4, a: "end" },
        ];
        const box = (o) => { const x1 = o.a === "middle" ? o.x - tw / 2 : o.a === "start" ? o.x : o.x - tw; return { x1, x2: x1 + tw, y1: o.y - 11, y2: o.y + 3 }; };
        const pick = opts2.find((o) => !hit(box(o), n)) || opts2[0];
        boxes.push(box(pick));
        lfloat.append(s("text", { class: "bubble-name", x: pick.x - n.x, y: pick.y - n.y, "text-anchor": pick.a }, name));
      }
      const lmag = s("g", { class: "b-mag" }, lfloat);
      const lg = s("g", { class: `label${intro ? " entering" : ""}`, style: `${posStyle(start)};${stagger}` }, lmag);
      labels.append(lg);

      n.g = g; n.lg = lg; n.mag = mag; n.lmag = lmag; n.scale = scale; n.fill = fill;
      n.final = () => {
        g.style.transform = `translate(${n.x}px, ${n.y}px)`;
        lg.style.transform = `translate(${n.x}px, ${n.y}px)`;
        scale.style.transform = `scale(${n.r})`;
        lg.classList.remove("entering");
      };
      next.set(c.id, { x: n.x, y: n.y, r: n.r });
    });

    svg.append(guide, layer, labels);
    wrap.replaceChildren(svg);
    bubbleNodes = placed;
    bubblePos = next;

    // Hover: spotlight one bubble, dim the rest, draw a drop line to its tone on the axis.
    function heat(n, on) {
      svg.classList.toggle("has-hot", on);
      n.g.classList.toggle("hot", on);
      n.lg.classList.toggle("hot", on);
      guide.replaceChildren();
      if (!on) { hideTip(); return; }
      const len = Math.max(0, axisY - (n.y + n.r));
      const label = signed(n.c.net), lw = label.length * 7.5 + 16;
      guide.append(
        s("line", { class: "drop", x1: n.x, x2: n.x, y1: n.y + n.r + 2, y2: axisY, style: `--len:${len}` }),
        s("g", { class: "badge", style: `transform: translate(${n.x}px, ${axisY}px)` },
          s("rect", { x: -lw / 2, y: -11, width: lw, height: 22, rx: 11, fill: n.fill }),
          s("text", { x: 0, y: 4, "text-anchor": "middle", style: `fill:${lum(n.fill) > 0.3 ? "#0b0b0b" : "#ffffff"}` }, label)));
    }

    // Magnetic field: bubbles lean away from the cursor; the hovered one leans in.
    if (!still()) {
      const k = () => W / svg.getBoundingClientRect().width;
      svg.addEventListener("pointermove", (e) => {
        const r = svg.getBoundingClientRect(), f = k();
        const px = (e.clientX - r.left) * f, py = (e.clientY - r.top) * f;
        for (const n of bubbleNodes) {
          const dx = n.x - px, dy = n.y - py, d = Math.hypot(dx, dy) || 1;
          let tx, ty;
          if (n.g.classList.contains("hot")) { tx = clamp(-dx * 0.12, -8, 8); ty = clamp(-dy * 0.12, -8, 8); }
          else { const push = 16 * Math.exp(-Math.max(0, d - n.r) / 110); tx = (dx / d) * push; ty = (dy / d) * push; }
          const t = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px)`;
          n.mag.style.transform = t; n.lmag.style.transform = t;
        }
      });
      svg.addEventListener("pointerleave", () => { for (const n of bubbleNodes) { n.mag.style.transform = ""; n.lmag.style.transform = ""; } });
    }

    function tip(e, c) {
      showTip(e, c.name, [
        ["Stories", `${fmt(c.total)} · ${pct(c.total, mentions)}% of coverage`],
        ["Positive", fmt(c.pos), cssVar("--pos")],
        ["Neutral", fmt(c.neu), cssVar("--neu")],
        ["Negative", fmt(c.neg), cssVar("--neg")],
        ["Net tone", signed(c.net)],
      ]);
    }

    const finish = () => {
      reflow(svg);
      for (const n of placed) n.final();
      if (intro) setTimeout(() => { for (const n of placed) { n.g.style.transitionDelay = ""; n.lg.style.transitionDelay = ""; n.scale.style.transitionDelay = ""; } }, 1800);
    };
    if (intro) whenVisible("bubbles", wrap, finish);
    else requestAnimationFrame(finish);

    const small = niceRound(maxN / 6), big = niceRound(maxN * 0.8);
    const key = (n) => { const r = rad(n), d = r * 2 + 2; return s("svg", { width: d, height: d, viewBox: `0 0 ${d} ${d}`, "aria-hidden": "true" },
      s("circle", { cx: d / 2, cy: d / 2, r, fill: "none", stroke: cssVar("--ink-3"), "stroke-width": 1 })); };
    $("bubbleLegend").replaceChildren(
      h("span", { class: "size-key" }, "Stories", key(small), fmt(small), key(big), fmt(big)),
      h("span", null, "Tone", h("span", { class: "ramp", "aria-hidden": "true" }), "negative → positive"),
    );
  }

  // ----- Strip chart: one row per company, one dot per story -----
  function renderStrip(opts = {}) {
    const wrap = $("strip");
    const W = Math.max(300, wrap.clientWidth);
    const narrow = W < 600;
    const labelW = narrow ? 80 : 150, netW = narrow ? 34 : 60;
    const rowH = 60, top = 26;
    const r = narrow ? 3.2 : 4;
    const x0 = labelW + 10, x1 = W - netW - 10;
    const x = (v) => x0 + ((v + 1) / 2) * (x1 - x0);
    const H = top + order.length * rowH + 4;
    const animate = !still() && !played.has("strip") && (opts.intro || opts.replay);

    const svg = s("svg", { class: "strip-svg", viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img",
      "aria-label": "Strip chart: every story plotted by tone, one row per company" });

    order.forEach((c, i) => {
      if (c.id !== state.selected) return;
      svg.append(s("rect", { class: "row-bg", x: 0, y: top + i * rowH + 2, width: W, height: rowH - 4, rx: 10 }));
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
    const finals = [];
    order.forEach((c, i) => {
      const cy = top + i * rowH + rowH / 2;
      const row = s("g", { class: "strip-row", onpointerenter: () => { svg.classList.add("has-hot"); row.classList.add("hot"); },
        onpointerleave: () => { svg.classList.remove("has-hot"); row.classList.remove("hot"); } });
      row.append(s("rect", { class: "row-hit", x: 0, y: cy - rowH / 2, width: W, height: rowH }));
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
      const maxOff = rowH / 2 - r - 3;
      const offsets = [0];
      for (let k = 1; k * step <= maxOff; k++) offsets.push(-k * step, k * step);
      const placed = [];
      const free = (px, py) => !placed.some((p) => Math.abs(p.x - px) < step && Math.abs(p.y - py) < step);
      const sorted = [...c.articles].sort((p, q) => Math.abs(p.score) - Math.abs(q.score));
      sorted.forEach((a, j) => {
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
        const tipFn = (e) => showTip(e, trunc(a.title, 110),
          [["Outlet", a.outlet], ["Published", a.date ? ago(a.date) : "—"], ["Tone", tone(a.score)]],
          isLink(a.url) ? "Click to open the story" : null);
        // Dots launch from the neutral line and fly out to their tone.
        const final = `translate(${pos.x}px, ${pos.y}px)`;
        const g = s("g", {
          class: "dot-pos",
          style: animate ? `transform: translate(${x(0)}px, ${cy}px) scale(0); transition-delay:${Math.round(i * 70 + Math.abs(a.score) * 520 + (j % 7) * 12)}ms` : `transform:${final}`,
        }, s("circle", {
          class: "dot", r, fill: diverging(a.score, 0.8),
          onpointerenter: tipFn, onpointermove: tipFn, onpointerleave: hideTip,
          onclick: () => { if (isLink(a.url)) window.open(a.url, "_blank", "noopener"); else select(c.id); },
        }));
        if (animate) finals.push([g, final]);
        row.append(g);
      });
      svg.append(row);
    });
    wrap.replaceChildren(svg);

    if (animate) {
      whenVisible("strip", wrap, () => {
        reflow(svg);
        for (const [g, f] of finals) g.style.transform = f;
        setTimeout(() => { for (const [g] of finals) g.style.transitionDelay = ""; }, 2400);
      });
    }

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
  function barRow(name, track, t, onPick, selected, i) {
    return h("div", {
      class: `bar-row${onPick ? " clickable" : ""}${selected ? " selected" : ""}`, tabindex: onPick ? 0 : null, role: onPick ? "button" : null,
      style: `--i:${i}`,
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
    const el = $("toneBars");
    const M = Math.max(1, ...order.map((c) => Math.max(c.neg + c.neu / 2, c.pos + c.neu / 2)));
    const P = (n) => (n / M) * 50;
    el.replaceChildren(...order.map((c, i) => {
      const half = P(c.neu / 2), gap = c.neu ? 2 : 0;
      const track = h("div", { class: "bar-track centered" });
      if (c.neu) track.append(h("span", { class: "seg-bar neu", style: { left: `${50 - half}%`, width: `${half * 2}%` } }));
      if (c.neg) track.append(h("span", { class: "seg-bar neg", style: { left: `${50 - half - P(c.neg)}%`, width: `calc(${P(c.neg)}% - ${gap}px)` } }));
      if (c.pos) track.append(h("span", { class: "seg-bar pos", style: { left: `calc(${50 + half}% + ${gap}px)`, width: `calc(${P(c.pos)}% - ${gap}px)` } }));
      return barRow(c.name, track, c, () => select(c.id), c.id === state.selected, i);
    }), h("div", { class: "bar-axis", "aria-hidden": "true" }, h("span"),
      h("div", null, h("span", null, fmt(Math.round(M))), h("span", null, "0"), h("span", null, fmt(Math.round(M)))),
      h("span", { style: { textAlign: "right" } }, "stories")));
    entrance("tone", el);
  }

  function renderOutletBars() {
    const el = $("outletBars");
    const rows = [...V.outlets].sort((a, b) => b.total - a.total);
    const M = Math.max(1, ...rows.map((o) => o.total));
    el.replaceChildren(...rows.map((o, i) =>
      barRow(o.outlet, h("div", { class: "bar-track" }, h("div", { class: "hstack", style: { width: `${(o.total / M) * 100}%` } }, ...toneStack(o))), o, null, false, i)));
    entrance("outlets", el);
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
    const table = h("table", { class: "heat" },
      h("thead", null, h("tr", null, h("th", { scope: "col" }, "Outlet"), ...order.map((c, ci) => h("th", { scope: "col", title: c.name, "data-col": ci }, c.short || c.name)))),
      h("tbody", null, ...outlets.map((o, ri) => h("tr", { "data-row": ri },
        h("th", { scope: "row" }, o.outlet),
        ...order.map((c, ci) => {
          const list = cell(o, c), n = list.length, t = tally(list);
          const alpha = n ? 0.08 + 0.72 * Math.sqrt(n / max) : 0;
          const bg = n ? mix(surface, ink, alpha) : null;
          return h("td", {
            class: `${n ? "" : "zero"}${c.id === state.selected ? " sel" : ""}`,
            "data-col": ci,
            style: `--d:${ri + ci};${bg ? `background:${bg};color:${lum(bg) > 0.22 ? "#0b0b0b" : "#f0efec"}` : ""}`,
            onpointerenter: () => crosshair(ri, ci), onpointerleave: () => crosshair(-1, -1),
            onpointermove: (e) => showTip(e, `${o.outlet} on ${c.name}`, [["Stories", fmt(n)], ["Net tone", n ? signed(t.net) : "—"]]),
            onclick: () => select(c.id),
          }, n ? fmt(n) : "·");
        })))));
    function crosshair(ri, ci) {
      if (ri < 0) hideTip();
      table.classList.toggle("has-hot", ri >= 0);
      for (const el of table.querySelectorAll(".row-hot, .col-hot")) el.classList.remove("row-hot", "col-hot");
      if (ri < 0) return;
      table.querySelector(`tbody tr[data-row="${ri}"]`).classList.add("row-hot");
      for (const el of table.querySelectorAll(`[data-col="${ci}"]`)) el.classList.add("col-hot");
    }
    $("heat").replaceChildren(table);
    entrance("heat", table);
  }

  // ----- Company detail -----
  function sortItems(items, tab) {
    const list = [...items];
    if (tab === "pos") return list.filter((i) => i.label === "positive").sort((a, b) => b.score - a.score);
    if (tab === "neg") return list.filter((i) => i.label === "negative").sort((a, b) => a.score - b.score);
    return list.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }

  let lastDetail = null;
  function renderDetail() {
    const c = V.companies.find((x) => x.id === state.selected);
    const mentions = V.companies.reduce((a, x) => a + x.total, 0);
    const byOutlet = V.outlets.map((o) => ({ outlet: o.outlet, ...tally(o.articles.filter((a) => a.companies.includes(c.id))) }))
      .filter((o) => o.total).sort((a, b) => b.total - a.total);
    const maxO = Math.max(1, ...byOutlet.map((o) => o.total));
    const items = sortItems(c.articles, state.tab);
    const el = $("detail");

    const body = h("div", { class: "detail-body" },
      h("div", { class: "detail-title" }, h("h2", null, c.name), h("span", { class: "product" }, c.product)),
      h("div", { class: "detail-stats" },
        tile("Stories", fmt(c.total), `${pct(c.total, mentions)}% of all coverage`, 0),
        tile("Net tone", h("span", { class: "net-pill" }, h("i", { style: { background: diverging(c.net, 40) } }), c.total ? signed(c.net) : "—"),
          `${fmt(c.pos)} positive · ${fmt(c.neg)} negative`, 1),
        tile("Neutral", fmt(c.neu), `${pct(c.neu, c.total)}% of its stories`, 2),
        tile("Outlets covering", fmt(byOutlet.length), `of ${V.outlets.length} tracked`, 3)),
      h("div", { class: "lists" },
        h("div", null,
          h("h3", null, "By outlet"),
          byOutlet.length ? h("div", { class: "mini-bars" }, ...byOutlet.map((o, i) =>
            h("div", { class: "mini-row", style: `--i:${i}`, title: `${o.outlet}: ${o.total} stories, net ${signed(o.net)}` },
              h("span", { class: "mini-name" }, o.outlet),
              h("div", { class: "mini-track" }, h("div", { class: "hstack", style: { width: `${(o.total / maxO) * 100}%` } }, ...toneStack(o))),
              h("span", { class: "mini-num" }, fmt(o.total)))))
            : h("p", { class: "empty" }, "No stories in this window.")),
        h("div", null,
          h("div", { class: "feed-col-head" }, h("h3", null, "Headlines"),
            h("div", { class: "feed-tabs", role: "tablist" }, ...[["neg", "Most negative"], ["pos", "Most positive"], ["new", "Latest"]].map(([k, l]) =>
              h("button", { role: "tab", "aria-selected": String(k === state.tab), onclick: () => { state.tab = k; renderDetail(); } }, l)))),
          items.length ? h("ul", { class: "feed" }, ...items.slice(0, 8).map((a, i) =>
            h("li", { style: `--i:${i}` }, h("span", { class: `dot-key ${a.label}`, title: a.label }),
              h("div", null,
                isLink(a.url) ? h("a", { href: a.url, target: "_blank", rel: "noopener noreferrer" }, a.title) : h("span", null, a.title),
                h("div", { class: "meta" }, [a.outlet, a.date ? ago(a.date) : null, `tone ${tone(a.score)}`].filter(Boolean).join(" · "))))))
            : h("p", { class: "empty" }, "Nothing in this slice."))),
    );

    el.replaceChildren(
      h("div", { class: "company-picker", role: "group", "aria-label": "Choose company" },
        ...V.companies.map((x) => h("button", { class: "chip", "aria-pressed": String(x.id === c.id), onclick: () => select(x.id) }, x.name))),
      body,
    );
    // Animate the panel's contents whenever what it shows changes.
    const key = `${c.id}|${state.tab}|${state.window}`;
    if (key !== lastDetail && !still()) body.classList.add("swap");
    lastDetail = key;
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
    if (id === state.selected) return;
    state.selected = id;
    hideTip();
    render();
  }

  // ---------- Controls ----------
  function moveSegThumb() {
    const seg = $("windowSeg"), thumb = seg.querySelector(".seg-thumb");
    const active = seg.querySelector('button[aria-checked="true"]');
    if (!thumb || !active) return;
    thumb.style.width = `${active.offsetWidth}px`;
    thumb.style.transform = `translateX(${active.offsetLeft}px)`;
  }
  $("windowSeg").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-window]");
    if (!b || b.dataset.window === state.window) return;
    state.window = b.dataset.window;
    render({ replay: true });
  });
  $("tableToggle").addEventListener("click", (e) => {
    const t = $("summaryTable");
    t.hidden = !t.hidden;
    e.currentTarget.setAttribute("aria-expanded", String(!t.hidden));
    e.currentTarget.textContent = t.hidden ? "View as table" : "Hide table";
  });
  $("themeToggle").addEventListener("click", (e) => {
    const btn = e.currentTarget;
    btn.classList.remove("spin"); reflow(btn); btn.classList.add("spin");
    const dark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === "dark"
      : matchMedia("(prefers-color-scheme: dark)").matches;
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("sentiment-theme", next); } catch (err) {}
    if (state.raw) render();
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => state.raw && render());

  // Card spotlight: a soft glow follows the pointer across whichever card it's over.
  document.addEventListener("pointermove", (e) => {
    if (still()) return;
    const card = e.target.closest && e.target.closest(".card, .tile");
    if (!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty("--mx", `${e.clientX - r.left}px`);
    card.style.setProperty("--my", `${e.clientY - r.top}px`);
  }, { passive: true });

  let rt;
  addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(() => { if (state.raw) { renderBubbles({}); renderStrip({}); moveSegThumb(); } }, 120);
  });

  init();
})();
