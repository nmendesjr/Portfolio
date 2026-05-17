/* global React */
const { useState, useEffect, useRef, useMemo } = React;

// ========== Hero ==========
function Hero({ data, theme }) {
  const year = new Date().getFullYear();
  return (
    <section className="hero" id="top">
      <div className="hero-top">
        <a href="#top" className="hero-mono" aria-label="Naama Mendes monogram">
          <svg className="mono-svg" viewBox="0 0 120 64" aria-hidden="true">
            <defs>
              <linearGradient id="monoGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity="1" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0.55" />
              </linearGradient>
            </defs>
            {/* big italic N */}
            <text x="0" y="52" className="mono-glyph mono-glyph--n">N</text>
            {/* overlapping outlined M */}
            <text x="44" y="52" className="mono-glyph mono-glyph--m">M</text>
            {/* tiny serif jr. accent */}
            <text x="100" y="20" className="mono-glyph mono-glyph--jr">jr.</text>
            {/* underline flourish */}
            <line x1="0" y1="60" x2="118" y2="60" className="mono-rule" />
            <circle cx="118" cy="60" r="2" className="mono-dot" />
          </svg>
        </a>
        <nav className="hero-nav">
          <a href="#work">Work</a>
          <a href="#about">About</a>
          <a href="#writing">Writing</a>
          <a href="#contact">Contact</a>
        </nav>
      </div>

      <div className="hero-body">
        <div className="hero-meta">
          <span className="meta-dot" />
          <span>Available for select roles · {year}</span>
        </div>
        <h1 className="hero-title">
          <span className="hero-title-line">Product builder.</span>
          <span className="hero-title-line hero-title-line--italic">Focused on growth.</span>
        </h1>
      </div>

      <div className="hero-foot">
        <div className="hero-foot-col">
          <span className="lbl">Currently</span>
          <span className="val">Director of Product, Tapcheck</span>
        </div>
        <div className="hero-foot-col">
          <span className="lbl">Previously</span>
          <span className="val">CB Insights · Datlo (YC W21) · Valuu</span>
        </div>
        <div className="hero-foot-col">
          <span className="lbl">Index</span>
          <span className="val">Selected work, 2016 — 2026</span>
        </div>
      </div>
    </section>
  );
}

// ========== Selected Work ==========
function WorkList({ data, openId, setOpenId }) {
  return (
    <section className="work" id="work">
      <header className="section-head">
        <span className="section-num">01</span>
        <h2 className="section-title">Selected Work <span className="section-title-em">2016 — 2026</span></h2>
        <span className="section-count">{data.works.length} roles</span>
      </header>

      <ol className="work-list">
        {data.works.map((w, i) => (
          <WorkRow key={w.id} work={w} index={i} open={openId === w.id}
                   onToggle={() => setOpenId(openId === w.id ? null : w.id)} />
        ))}
      </ol>
    </section>
  );
}

function WorkRow({ work, index, open, onToggle }) {
  const idx = String(index + 1).padStart(2, "0");
  return (
    <li className={"work-row " + (open ? "is-open" : "")}>
      <button className="work-row-btn" onClick={onToggle} aria-expanded={open}>
        <span className="wr-idx">{idx}</span>
        <span className="wr-year">{work.year}</span>
        <span className="wr-title">
          <span className="wr-company">{work.company}</span>
          <span className="wr-role">{work.role}</span>
        </span>
        <span className="wr-cat">{work.category}</span>
        <span className="wr-toggle" aria-hidden="true">
          <span className="wr-toggle-bar" />
          <span className="wr-toggle-bar wr-toggle-bar--v" />
        </span>
      </button>

      <div className="work-row-body" hidden={!open}>
        <div className="wrb-inner">
          <div className="wrb-headline">
            <p className="wrb-headline-text">{work.headline}</p>
          </div>

          <div className="wrb-grid">
            <div className="wrb-metrics">
              {work.metrics.map((m, k) => (
                m.type === "clients" ? (
                  <div className="metric metric--clients" key={k}>
                    <div className="metric-logos">
                      {m.logos.map((name, i) => (
                        <span className="logo-chip" key={i}>
                          <span className="logo-mark" aria-hidden="true">
                            {name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                          </span>
                          <span className="logo-name">{name}</span>
                        </span>
                      ))}
                    </div>
                    <div className="metric-clients-note">{m.note}</div>
                    <div className="metric-label">{m.label}</div>
                  </div>
                ) : (
                  <div className="metric" key={k}>
                    <div className="metric-value">{m.value}</div>
                    <div className="metric-label">{m.label}</div>
                  </div>
                )
              ))}
            </div>

            <ul className="wrb-bullets">
              {work.bullets.map((b, k) => (
                <li key={k}><span className="bullet-mark">→</span><span>{b}</span></li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </li>
  );
}

// ========== About ==========
function About({ data }) {
  return (
    <section className="about" id="about">
      <header className="section-head">
        <span className="section-num">02</span>
        <h2 className="section-title">About</h2>
      </header>

      <div className="about-grid">
        <div className="about-lead">
          <p>
            <span className="drop">{data.intro.charAt(0)}</span>
            {data.intro.slice(1)}
          </p>
          <p className="about-second">
            I lead through experimentation, behavioral data, and tight loops with engineering and design. I'm at home where the work is messy — payroll plumbing, infrastructure rewrites, marketplaces with cold‑start problems, models that need to be wrong less often.
          </p>
        </div>

        <aside className="about-aside">
          <div className="aside-block">
            <span className="aside-lbl">Education</span>
            <ul className="aside-list">
              {data.education.map((e, i) => (
                <li key={i}>
                  <div className="ed-row">
                    <span className="ed-degree">{e.degree}</span>
                    <span className="ed-year">{e.year}</span>
                  </div>
                  <div className="ed-school">{e.school}</div>
                  <div className="ed-note">{e.note}</div>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </section>
  );
}

// ========== Capabilities ==========
function Capabilities({ data }) {
  return (
    <section className="caps" id="capabilities">
      <header className="section-head">
        <span className="section-num">03</span>
        <h2 className="section-title">Capabilities</h2>
      </header>
      <ul className="caps-list">
        {data.capabilities.map((c, i) => (
          <li key={i} className="caps-item">
            <span className="caps-num">{String(i + 1).padStart(2, "0")}</span>
            <span className="caps-text">{c}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ========== Trusted by ==========
function Clients({ data }) {
  // Make a long marquee list (duplicated for seamless scroll)
  const list = [...data.clients, ...data.clients];
  return (
    <section className="clients" id="clients">
      <header className="section-head">
        <span className="section-num">04</span>
        <h2 className="section-title">Trusted by</h2>
      </header>
      <div className="marquee">
        <div className="marquee-track">
          {list.map((c, i) => (
            <span className="marquee-item" key={i}>
              <span className="marquee-bullet">✦</span>
              <span>{c}</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

// ========== Writing ==========
function Writing({ data }) {
  return (
    <section className="writing" id="writing">
      <header className="section-head">
        <span className="section-num">05</span>
        <h2 className="section-title">Writing <span className="section-title-em">— field notes</span></h2>
        <span className="section-count">{data.posts.length} posts</span>
      </header>

      <ul className="posts">
        {data.posts.map((p, i) => (
          <li className="post-row" key={i}>
            <a className="post-link" href={p.href || "#"}>
              <span className="post-date">
                <span className="post-year">{p.year}</span>
                <span className="post-day">{p.date}</span>
              </span>
              <span className="post-title">{p.title}</span>
              <span className="post-excerpt">{p.excerpt}</span>
              <span className="post-tag">{p.tag}</span>
            </a>
          </li>
        ))}
        <li className="post-row post-row--ghost">
          <span className="post-link post-link--ghost">
            <span className="post-date">
              <span className="post-year">2026</span>
              <span className="post-day">soon</span>
            </span>
            <span className="post-title">More on the way — drafts in flight on platform PMs and the agent‑era roadmap.</span>
            <span className="post-tag">Draft</span>
          </span>
        </li>
      </ul>
    </section>
  );
}

// ========== Footer / Contact ==========
function Footer({ data }) {
  const year = new Date().getFullYear();
  return (
    <footer className="foot" id="contact">
      <div className="foot-grid">
        <div className="foot-mark">
          <div className="foot-mono">N M</div>
          <div className="foot-mono-sub">Naama Mendes Jr.</div>
        </div>
        <div className="foot-cta">
          <h3 className="foot-headline">
            Have a hard product problem?<br />
            <span className="foot-headline-em">Let's talk.</span>
          </h3>
          <a href={`mailto:${data.email}`} className="foot-mail">{data.email}</a>
          <a href={`tel:${data.phone.replace(/[^0-9+]/g, "")}`} className="foot-phone">{data.phone}</a>
        </div>
      </div>
      <div className="foot-meta">
        <span>© {year} Naama Mendes Jr.</span>
        <span className="foot-meta-mid">Selected works, 2016 — {year}</span>
        <span>Designed and built with care.</span>
      </div>
    </footer>
  );
}

// ========== Floating contact button ==========
function FloatingContact({ data, theme, onToggleTheme }) {
  const [hover, setHover] = useState(false);
  return (
    <div className="float-stack">
      <button
        className="float-btn float-theme"
        onClick={onToggleTheme}
        aria-label="Toggle theme"
        title={theme === "dark" ? "Switch to light" : "Switch to dark"}
      >
        <span className="theme-icon">{theme === "dark" ? "☾" : "☀"}</span>
      </button>
      <a
        href={`mailto:${data.email}`}
        className="float-btn float-contact"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <span className="fc-dot" />
        <span className="fc-text">{hover ? data.email : "Contact"}</span>
      </a>
    </div>
  );
}

// ========== Scroll reveal hook ==========
function useScrollReveal() {
  useEffect(() => {
    const els = document.querySelectorAll("[data-reveal]");
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.setAttribute("data-revealed", "true"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.setAttribute("data-revealed", "true");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -8% 0px" }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

Object.assign(window, {
  Hero, WorkList, WorkRow, About, Capabilities, Clients, Writing, Footer, FloatingContact, useScrollReveal,
});
