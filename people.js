/* ============================================================
   Atlas of Lives  |  interactive 3D globe
   ------------------------------------------------------------
   Renders data/people.json as pins on a heritage-styled globe:
   navy ocean, parchment land, brass coastlines, crimson pins.
   Search and filtering are instant and local; the detail card
   also pulls a live summary from Wikipedia when online.
   ============================================================ */

(function () {
  "use strict";

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Palette, matched to styles.css ---------- */
  const C = {
    ocean: "#132038",
    oceanGlow: "#1d3054",
    land: "#EFE4CD",
    landSide: "rgba(195,154,80,0.30)",
    coast: "#C39A50",
    atmosphere: "#C39A50",
    ring: "160,43,34",
  };

  // One colour per field, drawn from the site's palette.
  const FIELD_COLOR = {
    freedom: "#A02B22",
    science: "#4E86B4",
    arts: "#C39A50",
    music: "#9A6BAE",
    leadership: "#C7563F",
    thought: "#5E9E82",
    exploration: "#D8894B",
    sport: "#6D8FA8",
  };
  const FIELD_FALLBACK = "#C39A50";
  const colorFor = (p) => FIELD_COLOR[p && p.field] || FIELD_FALLBACK;

  /* ---------- DOM ---------- */
  const el = {
    globe: document.getElementById("globe"),
    loading: document.getElementById("atlasLoading"),
    tooltip: document.getElementById("atlasTooltip"),
    search: document.getElementById("atlasSearch"),
    query: document.getElementById("atlasQuery"),
    clear: document.getElementById("atlasClear"),
    filters: document.getElementById("atlasFilters"),
    count: document.getElementById("atlasCount"),
    list: document.getElementById("atlasList"),
    spin: document.getElementById("atlasSpin"),
    spinLabel: document.getElementById("atlasSpinLabel"),
    home: document.getElementById("atlasHome"),
    card: document.getElementById("atlasCard"),
    cardClose: document.getElementById("atlasCardClose"),
    cardField: document.getElementById("atlasCardField"),
    cardName: document.getElementById("atlasCardName"),
    cardMeta: document.getElementById("atlasCardMeta"),
    cardBlurb: document.getElementById("atlasCardBlurb"),
    cardWiki: document.getElementById("atlasCardWiki"),
    cardLink: document.getElementById("atlasCardLink"),
    thumb: document.getElementById("atlasThumb"),
    thumbImg: document.getElementById("atlasThumbImg"),
  };

  /* ---------- State ---------- */
  let world = null;
  let people = [];
  let fields = [];
  let fieldLabel = {};
  let visible = [];
  let activeField = "all";
  let selected = null;
  let spinning = !prefersReduced;
  const wikiCache = new Map();

  /* ---------- Helpers ---------- */

  function yearText(p) {
    const fmt = (y) => (y < 0 ? Math.abs(y) + " BCE" : String(y));
    if (p.born == null) return "";
    if (p.died == null) return "b. " + fmt(p.born);
    return fmt(p.born) + " to " + fmt(p.died);
  }

  // Keep the panel clear of the fixed header.
  function syncHeaderHeight() {
    const header = document.getElementById("siteHeader");
    if (!header) return;
    document.documentElement.style.setProperty(
      "--header-h",
      header.offsetHeight + "px"
    );
  }

  /* ---------- Search ---------- */

  // Supports names, places, field labels, a bare year ("1882"),
  // and century phrases ("19th century", "1800s").
  function parseEra(q) {
    let m = q.match(/(\d{1,2})\s*(?:st|nd|rd|th)?\s*century/);
    if (m) {
      const c = parseInt(m[1], 10);
      return { from: (c - 1) * 100 + 1, to: c * 100 };
    }
    m = q.match(/^(\d{3,4})0s$/);
    if (m) {
      const d = parseInt(m[1], 10) * 10;
      return { from: d, to: d + 9 };
    }
    m = q.match(/^(-?\d{3,4})$/);
    if (m) {
      const y = parseInt(m[1], 10);
      return { from: y, to: y };
    }
    return null;
  }

  function matches(p, q, era) {
    if (era) {
      const from = p.born != null ? p.born : -9999;
      const to = p.died != null ? p.died : new Date().getFullYear();
      if (to < era.from || from > era.to) return false;
      if (!q) return true;
    }
    if (!q) return true;
    const hay = (
      p.name +
      " " +
      p.place +
      " " +
      (fieldLabel[p.field] || "") +
      " " +
      p.blurb
    ).toLowerCase();
    return hay.indexOf(q) !== -1;
  }

  function applyFilters() {
    const raw = (el.query.value || "").trim().toLowerCase();
    const era = parseEra(raw);
    const q = era ? "" : raw;

    visible = people.filter(
      (p) => (activeField === "all" || p.field === activeField) && matches(p, q, era)
    );

    el.clear.hidden = !raw;
    renderCount();
    renderList();
    if (world) world.pointsData(visible);
    // If the open card is now filtered out, leave it; the visitor asked for it.
  }

  /* ---------- Rendering: panel ---------- */

  function renderCount() {
    const n = visible.length;
    const total = people.length;
    el.count.textContent =
      n === total
        ? total + " lives on the globe"
        : n + " of " + total + " shown";
  }

  function renderFilters() {
    el.filters.innerHTML = "";

    const make = (id, label, color) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "atlas-chip";
      b.setAttribute("aria-pressed", String(activeField === id));
      if (color) {
        const sw = document.createElement("span");
        sw.className = "swatch";
        sw.style.color = color;
        b.appendChild(sw);
      }
      b.appendChild(document.createTextNode(label));
      b.addEventListener("click", () => {
        activeField = activeField === id ? "all" : id;
        renderFilters();
        applyFilters();
      });
      return b;
    };

    el.filters.appendChild(make("all", "All"));
    fields.forEach((f) => {
      el.filters.appendChild(make(f.id, f.label, FIELD_COLOR[f.id]));
    });
  }

  function renderList() {
    el.list.innerHTML = "";

    if (!visible.length) {
      const li = document.createElement("li");
      li.className = "atlas-empty";
      li.textContent = "No one here by that name. Try a country, a field, or a century.";
      el.list.appendChild(li);
      return;
    }

    const frag = document.createDocumentFragment();
    visible.forEach((p) => {
      const li = document.createElement("li");

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "atlas-item" + (p.home ? " is-home" : "");
      if (selected && selected.id === p.id) btn.setAttribute("aria-current", "true");

      const pip = document.createElement("span");
      pip.className = "pip";
      pip.style.background = colorFor(p);

      const who = document.createElement("span");
      who.className = "who";

      const nm = document.createElement("span");
      nm.className = "nm";
      nm.textContent = p.name;

      const mt = document.createElement("span");
      mt.className = "mt";
      mt.textContent = [yearText(p), p.place].filter(Boolean).join("  ·  ");

      who.appendChild(nm);
      who.appendChild(mt);
      btn.appendChild(pip);
      btn.appendChild(who);
      btn.addEventListener("click", () => select(p, true));

      li.appendChild(btn);
      frag.appendChild(li);
    });
    el.list.appendChild(frag);
  }

  /* ---------- Rendering: detail card ---------- */

  function renderCard(p) {
    el.cardField.textContent = fieldLabel[p.field] || "";
    el.cardField.style.color = colorFor(p);
    el.cardName.textContent = p.name;
    el.cardMeta.textContent = [yearText(p), p.place].filter(Boolean).join("  ·  ");
    el.cardBlurb.textContent = p.blurb;

    const title = p.wiki || p.name;
    el.cardLink.href =
      "https://en.wikipedia.org/wiki/" + encodeURIComponent(title.replace(/ /g, "_"));

    el.thumb.hidden = true;
    el.thumbImg.removeAttribute("src");
    el.cardWiki.innerHTML = "";
    const loading = document.createElement("p");
    loading.className = "loading";
    loading.textContent = "Fetching a summary...";
    el.cardWiki.appendChild(loading);

    el.card.hidden = false;
    el.card.scrollTop = 0;
    const body = el.card.querySelector(".atlas-card-body");
    if (body) body.scrollTop = 0;

    loadWiki(p);
  }

  async function loadWiki(p) {
    const title = p.wiki || p.name;
    const key = title;

    const paint = (data) => {
      // Ignore a late response for a person the visitor has moved past.
      if (!selected || selected.id !== p.id) return;
      el.cardWiki.innerHTML = "";

      if (!data) {
        const msg = document.createElement("p");
        msg.className = "loading";
        msg.textContent =
          "No live summary just now. The account above is drawn from this site's own record.";
        el.cardWiki.appendChild(msg);
        return;
      }

      if (data.thumbnail) {
        el.thumbImg.src = data.thumbnail;
        el.thumbImg.alt = "Portrait of " + p.name;
        el.thumb.hidden = false;
      }

      const para = document.createElement("p");
      para.textContent = data.extract;
      el.cardWiki.appendChild(para);

      const src = document.createElement("span");
      src.className = "src";
      src.textContent = "Summary from Wikipedia";
      el.cardWiki.appendChild(src);
    };

    if (wikiCache.has(key)) {
      paint(wikiCache.get(key));
      return;
    }

    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 7000);
      const res = await fetch(
        "https://en.wikipedia.org/api/rest_v1/page/summary/" +
          encodeURIComponent(title.replace(/ /g, "_")),
        { signal: ctrl.signal, headers: { Accept: "application/json" } }
      );
      clearTimeout(timer);
      if (!res.ok) throw new Error("wiki " + res.status);
      const json = await res.json();
      const data = json && json.extract
        ? {
            extract: json.extract,
            thumbnail: json.thumbnail ? json.thumbnail.source : null,
          }
        : null;
      wikiCache.set(key, data);
      paint(data);
    } catch {
      wikiCache.set(key, null);
      paint(null);
    }
  }

  function closeCard() {
    el.card.hidden = true;
    selected = null;
    if (world) world.ringsData([]);
    renderList();
  }

  /* ---------- Selection ---------- */

  function select(p, fly) {
    selected = p;
    renderCard(p);
    renderList();

    if (!world) return;

    world.ringsData([p]);

    if (fly) {
      setSpinning(false);
      world.pointOfView(
        { lat: p.lat, lng: p.lng, altitude: 1.55 },
        prefersReduced ? 0 : 1000
      );
    }
  }

  function setSpinning(on) {
    spinning = on;
    if (world && world.controls()) world.controls().autoRotate = on;
    el.spin.setAttribute("aria-pressed", String(on));
    el.spinLabel.textContent = on ? "Pause" : "Spin";
  }

  /* ---------- Tooltip ---------- */

  function showTooltip(p, event) {
    if (!p) {
      el.tooltip.classList.remove("on");
      el.tooltip.setAttribute("aria-hidden", "true");
      el.globe.style.cursor = "grab";
      return;
    }
    el.tooltip.innerHTML = "";
    const b = document.createElement("b");
    b.textContent = p.name;
    const s = document.createElement("span");
    s.textContent = [yearText(p), p.place].filter(Boolean).join("  ·  ");
    el.tooltip.appendChild(b);
    el.tooltip.appendChild(s);
    el.tooltip.classList.add("on");
    el.tooltip.setAttribute("aria-hidden", "false");
    el.globe.style.cursor = "pointer";
    if (event) {
      const r = el.globe.getBoundingClientRect();
      el.tooltip.style.left = event.clientX - r.left + "px";
      el.tooltip.style.top = event.clientY - r.top + "px";
    }
  }

  /* ---------- Globe ---------- */

  async function loadCountries() {
    const sources = [
      "https://unpkg.com/globe.gl/example/datasets/ne_110m_admin_0_countries.geojson",
      "https://cdn.jsdelivr.net/npm/globe.gl/example/datasets/ne_110m_admin_0_countries.geojson",
    ];
    for (const url of sources) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const geo = await res.json();
        if (geo && Array.isArray(geo.features) && geo.features.length) return geo.features;
      } catch {
        /* try the next mirror */
      }
    }
    return null;
  }

  function buildGlobe(countries) {
    world = Globe()(el.globe)
      .backgroundColor("rgba(0,0,0,0)")
      .showAtmosphere(true)
      .atmosphereColor(C.atmosphere)
      .atmosphereAltitude(0.17)
      .showGraticules(!countries); // structure to fall back on if outlines fail

    // Ocean sphere, no photoreal texture: this is a heritage map, not a satellite.
    try {
      const mat = world.globeMaterial();
      if (mat) {
        if (mat.color) mat.color.set(C.ocean);
        if (mat.emissive) mat.emissive.set(C.oceanGlow);
        if ("emissiveIntensity" in mat) mat.emissiveIntensity = 0.14;
        if ("shininess" in mat) mat.shininess = 4;
      }
    } catch {
      /* material shape differs across versions; the default still renders */
    }

    if (countries) {
      world
        .polygonsData(countries)
        .polygonCapColor(() => C.land)
        .polygonSideColor(() => C.landSide)
        .polygonStrokeColor(() => C.coast)
        .polygonAltitude(0.008)
        .polygonsTransitionDuration(0);
    }

    world
      .pointsData(visible)
      .pointLat("lat")
      .pointLng("lng")
      .pointColor(colorFor)
      .pointAltitude((p) => (selected && selected.id === p.id ? 0.09 : 0.035))
      .pointRadius((p) => (selected && selected.id === p.id ? 0.42 : 0.3))
      .pointsTransitionDuration(300)
      .pointLabel(() => "") // custom HTML tooltip instead of the built-in one
      .onPointHover((p, prev, event) => showTooltip(p, event))
      .onPointClick((p) => select(p, true));

    world
      .ringColor(() => (t) => "rgba(" + C.ring + "," + (1 - t) + ")")
      .ringMaxRadius(5)
      .ringPropagationSpeed(2.2)
      .ringRepeatPeriod(prefersReduced ? 0 : 900)
      .ringsData([]);

    const controls = world.controls();
    if (controls) {
      controls.autoRotate = spinning;
      controls.autoRotateSpeed = 0.32;
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.minDistance = 160;
      controls.maxDistance = 620;
      // Any manual interaction stops the drift.
      controls.addEventListener("start", () => {
        if (spinning) setSpinning(false);
      });
    }

    sizeGlobe();

    // Open on Albert's birthplace, the thread that ties the two pages together.
    const albert = people.find((p) => p.home) || people[0];
    if (albert) {
      world.pointOfView({ lat: albert.lat, lng: albert.lng, altitude: 2.4 }, 0);
    }

    // The globe.gl mousemove handler gives us the event; keep the tooltip
    // glued to the cursor while hovering a pin.
    el.globe.addEventListener("mousemove", (e) => {
      if (!el.tooltip.classList.contains("on")) return;
      const r = el.globe.getBoundingClientRect();
      el.tooltip.style.left = e.clientX - r.left + "px";
      el.tooltip.style.top = e.clientY - r.top + "px";
    });
    el.globe.addEventListener("mouseleave", () => showTooltip(null));
  }

  function sizeGlobe() {
    if (!world) return;
    const r = el.globe.getBoundingClientRect();
    world.width(r.width).height(r.height);
  }

  /* ---------- Wiring ---------- */

  function wireControls() {
    el.search.addEventListener("submit", (e) => e.preventDefault());
    el.query.addEventListener("input", applyFilters);
    el.clear.addEventListener("click", () => {
      el.query.value = "";
      el.query.focus();
      applyFilters();
    });

    el.spin.addEventListener("click", () => setSpinning(!spinning));

    el.home.addEventListener("click", () => {
      const albert = people.find((p) => p.home);
      if (albert) select(albert, true);
    });

    el.cardClose.addEventListener("click", closeCard);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !el.card.hidden) closeCard();
      // "/" focuses search, the way search boxes ought to work
      if (e.key === "/" && document.activeElement !== el.query) {
        e.preventDefault();
        el.query.focus();
      }
    });

    let resizeTimer = null;
    window.addEventListener("resize", () => {
      syncHeaderHeight();
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(sizeGlobe, 120);
    });
  }

  function fail(message) {
    el.loading.innerHTML = "";
    const p = document.createElement("span");
    p.textContent = message;
    el.loading.appendChild(p);
  }

  /* ---------- Boot ---------- */

  async function init() {
    syncHeaderHeight();
    wireControls();

    let data;
    try {
      const res = await fetch("data/people.json");
      if (!res.ok) throw new Error("people.json " + res.status);
      data = await res.json();
    } catch {
      fail("The atlas data could not be loaded.");
      return;
    }

    people = Array.isArray(data.people) ? data.people : [];
    fields = Array.isArray(data.fields) ? data.fields : [];
    fields.forEach((f) => (fieldLabel[f.id] = f.label));
    people.sort((a, b) => a.name.localeCompare(b.name));
    visible = people.slice();

    renderFilters();
    renderCount();
    renderList();

    if (typeof Globe !== "function") {
      fail("The globe library could not be reached. The list beside it still works.");
      return;
    }

    const countries = await loadCountries();
    buildGlobe(countries);

    el.loading.classList.add("gone");
    setSpinning(spinning);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
