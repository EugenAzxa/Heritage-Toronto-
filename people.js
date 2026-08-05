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
    map: document.getElementById("atlasMap"),
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
  let torontoOnly = false;   // narrow the world view to the Canadian cohort
  let selected = null;
  let spinning = !prefersReduced;
  const wikiCache = new Map();

  /* Two datasets share one globe: lives across the world, and Heritage
     Toronto's plaques across one city. The plaque file is ~280KB, so it
     is fetched only when someone actually asks for it. */
  let mode = "world";            // which dataset: "world" | "toronto"

  /* Which instrument is drawing it. The globe is built from 110m country
     outlines, so below roughly a regional view it has nothing left to
     show. Past that point it hands the same coordinates to the street
     map, which does have streets. */
  let surface = "globe";         // "globe" | "street"
  const HANDOFF_ALTITUDE = 0.075;   // globe altitude at which streets take over
  const RETURN_ZOOM = 6;            // street zoom at which the globe takes back
  let handingOff = false;

  let plaques = null;            // null until first loaded
  let plaqueMeta = null;
  const TORONTO_VIEW = { lat: 43.705, lng: -79.39, altitude: 0.028 };
  const PLAQUE_COLOR = "#C39A50";

  const isToronto = () => mode === "toronto";
  const dataset = () => (isToronto() ? plaques || [] : people);

  /* Five of the 312 plaques can be spoken with. voices.js owns which,
     and returns null for everything else. */
  let voicesOnly = false;
  const voiceMarkers = [];
  function voiceFor(p) {
    if (!isPlaque(p) || !window.HeritageVoices) return null;
    return window.HeritageVoices.forPlaque(p.name);
  }

  /* ---------- Helpers ---------- */

  // Plaques have no id; identity is name plus position.
  function sameEntry(a, b) {
    if (!a || !b) return false;
    if (a.id && b.id) return a.id === b.id;
    return a.name === b.name && a.lat === b.lat && a.lng === b.lng;
  }

  function firstLine(text) {
    const s = String(text || "").replace(/\s+/g, " ").trim();
    return s.length > 74 ? s.slice(0, 74).trimEnd() + "..." : s;
  }

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

  function matchesPlaque(p, q) {
    if (!q) return true;
    return (p.name + " " + p.text).toLowerCase().indexOf(q) !== -1;
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

    if (isToronto()) {
      visible = (plaques || []).filter(
        (p) => matchesPlaque(p, raw) && (!voicesOnly || voiceFor(p))
      );
    } else {
      const era = parseEra(raw);
      const q = era ? "" : raw;
      visible = people.filter(
        (p) =>
          (activeField === "all" || p.field === activeField) &&
          (!torontoOnly || p.anchor === "died") &&
          matches(p, q, era)
      );
    }

    el.clear.hidden = !raw;
    renderCount();
    renderList();
    if (isToronto() || surface === "street") paintMarkers();
    else if (world) world.pointsData(visible);
    // If the open card is now filtered out, leave it; the visitor asked for it.
  }

  /* ---------- Rendering: panel ---------- */

  function renderCount() {
    const n = visible.length;
    const total = dataset().length;
    const noun = isToronto()
      ? "Heritage Toronto plaques"
      : torontoOnly
      ? "lives that ended in Canada"
      : "lives on the globe";
    el.count.textContent =
      n === total ? total + " " + noun : n + " of " + total + " shown";
  }

  function renderFilters() {
    el.filters.innerHTML = "";

    // Toronto mode has its own single control: five of these plaques talk,
    // and 312 pins is too many to find them in by chance.
    if (isToronto()) {
      const n = window.HeritageVoices ? window.HeritageVoices.all().length : 0;
      if (n) {
        const vb = document.createElement("button");
        vb.type = "button";
        vb.className = "atlas-chip atlas-chip--voice";
        vb.setAttribute("aria-pressed", String(voicesOnly));
        vb.innerHTML =
          '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4L3 21l1.1-8.6A8.4 8.4 0 1 1 21 11.5z"/></svg>';
        vb.appendChild(document.createTextNode("The " + n + " that speak"));
        vb.addEventListener("click", () => {
          voicesOnly = !voicesOnly;
          renderFilters();
          applyFilters();
          if (voicesOnly) fitToVisible();
        });
        el.filters.appendChild(vb);
      }
      return;
    }

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

    // Toronto is the point of this atlas for Heritage Toronto, so it gets
    // its own control rather than hiding among the disciplines.
    const tor = document.createElement("button");
    tor.type = "button";
    tor.className = "atlas-chip atlas-chip--toronto";
    tor.setAttribute("aria-pressed", String(torontoOnly));
    tor.textContent = "Died in Canada";
    tor.addEventListener("click", () => {
      torontoOnly = !torontoOnly;
      renderFilters();
      applyFilters();
      if (torontoOnly && world) {
        setSpinning(false);
        world.pointOfView({ lat: 51, lng: -95, altitude: 1.15 }, prefersReduced ? 0 : 1200);
        setTimeout(stylePoints, prefersReduced ? 10 : 1300);
      }
    });
    el.filters.appendChild(tor);

    fields.forEach((f) => {
      el.filters.appendChild(make(f.id, f.label, FIELD_COLOR[f.id]));
    });
  }

  function renderList() {
    el.list.innerHTML = "";

    if (!visible.length) {
      const li = document.createElement("li");
      li.className = "atlas-empty";
      li.textContent = isToronto()
        ? "No plaque matches that. Try a street, a building, or a name."
        : "No one here by that name. Try a country, a field, or a century.";
      el.list.appendChild(li);
      return;
    }

    const frag = document.createDocumentFragment();
    visible.forEach((p) => {
      const li = document.createElement("li");

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "atlas-item" + (p.home ? " is-home" : "");
      if (selected && sameEntry(selected, p)) btn.setAttribute("aria-current", "true");

      const voice = voiceFor(p);
      if (voice) btn.classList.add("has-voice");

      const pip = document.createElement("span");
      pip.className = "pip";
      pip.style.background = isToronto() ? PLAQUE_COLOR : colorFor(p);

      const who = document.createElement("span");
      who.className = "who";

      const nm = document.createElement("span");
      nm.className = "nm";
      nm.textContent = p.name;

      if (voice) {
        const tag = document.createElement("span");
        tag.className = "voice-tag";
        tag.textContent = "Speaks";
        nm.appendChild(document.createTextNode(" "));
        nm.appendChild(tag);
      }

      const mt = document.createElement("span");
      mt.className = "mt";
      mt.textContent = isToronto()
        ? firstLine(voice ? voice.teaser : p.text)
        : [yearText(p), p.place].filter(Boolean).join("  ·  ");

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

  function renderPlaqueCard(p) {
    const voice = voiceFor(p);

    el.cardField.textContent = voice
      ? "Heritage Toronto plaque  ·  speaks"
      : "Heritage Toronto plaque";
    el.cardField.style.color = PLAQUE_COLOR;
    el.cardName.textContent = p.name;
    el.cardMeta.textContent = p.lat.toFixed(5) + ", " + p.lng.toFixed(5);

    // The plaque's own words are the content; there is nothing to fetch.
    el.cardBlurb.textContent = "";
    el.thumb.hidden = true;
    el.thumbImg.removeAttribute("src");

    el.cardWiki.innerHTML = "";

    // The five that talk lead with the invitation, above the plaque text.
    // Reading the plaque is what the visitor expected; being answered by
    // it is not, so it cannot be buried at the bottom of the card.
    if (voice) {
      const ask = document.createElement("button");
      ask.type = "button";
      ask.className = "atlas-ask";
      ask.innerHTML =
        '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4L3 21l1.1-8.6A8.4 8.4 0 1 1 21 11.5z"/></svg>';
      const label = document.createElement("span");
      label.appendChild(document.createTextNode("Speak with " + voice.name));
      const sub = document.createElement("em");
      sub.textContent = voice.dates ? voice.dates + "  ·  " + voice.role : voice.role;
      label.appendChild(sub);
      ask.appendChild(label);
      ask.addEventListener("click", () => window.HeritageVoices.open(voice));
      el.cardWiki.appendChild(ask);

      const teaser = document.createElement("p");
      teaser.className = "atlas-ask-teaser";
      teaser.textContent = voice.teaser;
      el.cardWiki.appendChild(teaser);
    }
    String(p.text || "")
      .split(/\n{1,}/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((para) => {
        const el2 = document.createElement("p");
        el2.textContent = para;
        el.cardWiki.appendChild(el2);
      });
    const src = document.createElement("span");
    src.className = "src";
    src.textContent = "Plaque text, Heritage Toronto";
    el.cardWiki.appendChild(src);

    el.cardLink.href =
      "https://www.google.com/maps/search/?api=1&query=" + p.lat + "," + p.lng;
    el.cardLink.firstChild.textContent = "Open in Google Maps ";

    el.card.hidden = false;
    const body = el.card.querySelector(".atlas-card-body");
    if (body) body.scrollTop = 0;
  }

  // Branch on what the record IS, not on which mode is showing it: the
  // street map can now carry people as well as plaques.
  const isPlaque = (p) => p && typeof p.text === "string" && !p.wiki;

  function renderCard(p) {
    if (isPlaque(p)) return renderPlaqueCard(p);
    el.cardLink.firstChild.textContent = "Read more on Wikipedia ";
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
      if (!selected || !sameEntry(selected, p)) return;
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

    if (isToronto() || surface === "street") {
      highlightMarker();
      if (fly && lmap) {
        lmap.setView([p.lat, p.lng], Math.max(lmap.getZoom(), 16), {
          animate: !prefersReduced,
        });
      }
      return;
    }

    if (!world) return;
    world.ringsData([p]);
    stylePoints();

    if (fly) {
      setSpinning(false);
      world.pointOfView({ lat: p.lat, lng: p.lng, altitude: 1.55 }, prefersReduced ? 0 : 1000);
    }
  }

  /* ---------- Toronto street map ----------
     Leaflet is fetched on first use only, so visitors who never open
     the Toronto view never download it. */

  let lmap = null;
  let markerLayer = null;
  const markerFor = new Map();

  function loadAsset(tag, attrs) {
    return new Promise((resolve, reject) => {
      const node = document.createElement(tag);
      Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
      node.onload = resolve;
      node.onerror = () => reject(new Error("failed: " + (attrs.src || attrs.href)));
      document.head.appendChild(node);
    });
  }

  async function ensureLeaflet() {
    if (window.L) return true;
    try {
      await loadAsset("link", {
        rel: "stylesheet",
        href: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
      });
      await loadAsset("script", {
        src: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
      });
      return Boolean(window.L);
    } catch {
      return false;
    }
  }

  function buildMap() {
    if (lmap) return;
    const L = window.L;
    lmap = L.map(el.map, {
      center: [43.68, -79.38],
      zoom: 12,
      // Must go below RETURN_ZOOM, or zooming out can never reach the
      // point where the globe takes back over.
      minZoom: 4,
      maxZoom: 18,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
      {
        subdomains: "abcd",
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="https://carto.com/attributions">CARTO</a>. Plaque data: Heritage Toronto.',
      }
    ).addTo(lmap);

    markerLayer = L.layerGroup().addTo(lmap);
    watchStreetZoom();
  }

  function paintMarkers() {
    if (!lmap || !window.L) return;
    const L = window.L;
    markerLayer.clearLayers();
    markerFor.clear();

    let voiceSeen = 0;
    voiceMarkers.length = 0;

    visible.forEach((p) => {
      const voice = voiceFor(p);

      // A plaque you can talk to has to look different from a plaque you
      // can only read, or nobody discovers the feature. It gets a haloed
      // marker and a label that stays on screen without being hovered.
      if (voice) {
        const icon = L.divIcon({
          className: "voice-marker",
          iconSize: [34, 34],
          iconAnchor: [17, 17],
          html:
            '<span class="voice-marker-ring" aria-hidden="true"></span>' +
            '<span class="voice-marker-dot" aria-hidden="true">' +
            '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4L3 21l1.1-8.6A8.4 8.4 0 1 1 21 11.5z"/></svg></span>',
        });
        const m = L.marker([p.lat, p.lng], { icon, riseOnHover: true, zIndexOffset: 800 });

        // Permanent labels have no collision avoidance in Leaflet, and four
        // of the five stand within a few blocks of each other downtown. A
        // surname is enough to read, and alternating the side keeps the
        // labels from stacking on top of one another at city zoom.
        const surname = voice.name.split(/\s+/).pop();
        const right = voiceSeen++ % 2 === 0;
        m.bindTooltip("Ask " + surname, {
          permanent: true,
          direction: right ? "right" : "left",
          offset: right ? [14, 0] : [-14, 0],
          className: "voice-tip",
        });
        m.on("click", () => select(p, false));
        m.addTo(markerLayer);
        markerFor.set(entryKey(p), m);
        voiceMarkers.push(m);
        return;
      }

      const m = L.circleMarker([p.lat, p.lng], {
        radius: 6,
        className: "plaque-pin",
        color: "#0D1526",
        weight: 1.4,
        fillColor: isPlaque(p) ? PLAQUE_COLOR : colorFor(p),
        fillOpacity: 0.92,
      });
      m.options.__baseColor = isPlaque(p) ? PLAQUE_COLOR : colorFor(p);
      m.bindTooltip(p.name, { direction: "top", offset: [0, -6] });
      m.on("click", () => select(p, false));
      m.addTo(markerLayer);
      markerFor.set(entryKey(p), m);
    });

    thinLabels();
    highlightMarker();
  }

  /* Leaflet does no collision avoidance on permanent tooltips, and three
     of the five voices stand within a few blocks of each other downtown.
     Rather than let the labels pile up, hide any that would land on top of
     one already placed, and bring them back as zooming separates them. The
     marker itself is always visible, so nothing becomes unfindable. */
  const LABEL_GAP = 116; // px between label anchors before one is dropped
  function thinLabels() {
    if (!lmap || !voiceMarkers.length) return;
    const kept = [];
    voiceMarkers.forEach((m) => {
      const tip = m.getTooltip && m.getTooltip();
      const node = tip && tip.getElement();
      if (!node) return;
      const pt = lmap.latLngToLayerPoint(m.getLatLng());
      const clash = kept.some(
        (q) => Math.abs(q.x - pt.x) < LABEL_GAP && Math.abs(q.y - pt.y) < 26
      );
      node.classList.toggle("is-hidden", clash);
      if (!clash) kept.push(pt);
    });
  }

  function highlightMarker() {
    markerFor.forEach((m, key) => {
      const on = selected && entryKey(selected) === key;

      // The five voices are divIcon markers, which have no setStyle; they
      // carry their selected state as a class on their own element.
      if (typeof m.setStyle !== "function") {
        const node = m.getElement();
        if (node) node.classList.toggle("is-on", Boolean(on));
        return;
      }

      const base = m.options.__baseColor || PLAQUE_COLOR;
      m.setStyle({
        fillColor: on ? "#A02B22" : base,
        radius: on ? 9 : 6,
        weight: on ? 2 : 1.4,
      });
      if (on) m.bringToFront();
    });
  }

  const entryKey = (p) => p.name + "|" + p.lat + "|" + p.lng;

  // Frame whatever is currently filtered in. Used when someone narrows the
  // 312 plaques down to the five that speak; they are scattered across the
  // city and the default view holds only a few of them.
  function fitToVisible() {
    if (!lmap || !window.L || !visible.length) return;
    const bounds = window.L.latLngBounds(visible.map((p) => [p.lat, p.lng]));
    lmap.fitBounds(bounds, { padding: [70, 70], maxZoom: 14, animate: !prefersReduced });
  }

  /* ---------- World / Toronto ---------- */

  async function loadPlaques() {
    if (plaques) return true;
    const btn = document.getElementById("modeToronto");
    if (btn) btn.classList.add("is-loading");
    try {
      const res = await fetch("data/plaques.json");
      if (!res.ok) throw new Error("plaques " + res.status);
      const data = await res.json();
      plaques = Array.isArray(data.plaques) ? data.plaques : [];
      plaqueMeta = data;
      plaques.sort((a, b) => a.name.localeCompare(b.name));
      return true;
    } catch {
      plaques = null;
      return false;
    } finally {
      if (btn) btn.classList.remove("is-loading");
    }
  }

  async function setMode(next) {
    if (next === mode) return;

    if (next === "toronto") {
      // The voice list must be in before the markers are painted, or the
      // five that speak get drawn as ordinary plaques.
      const [gotData, gotLeaflet] = await Promise.all([
        loadPlaques(),
        ensureLeaflet(),
        window.HeritageVoices ? window.HeritageVoices.ready() : Promise.resolve(),
      ]);
      if (!gotData || !gotLeaflet) {
        el.count.textContent = gotData
          ? "The map library could not be reached."
          : "The plaque data could not be loaded.";
        return;
      }
    }

    mode = next;
    selected = null;
    el.card.hidden = true;
    el.query.value = "";
    activeField = "all";
    if (world) world.ringsData([]);

    document.getElementById("modeWorld").classList.toggle("is-on", !isToronto());
    document.getElementById("modeWorld").setAttribute("aria-pressed", String(!isToronto()));
    document.getElementById("modeToronto").classList.toggle("is-on", isToronto());
    document.getElementById("modeToronto").setAttribute("aria-pressed", String(isToronto()));

    // Fields only mean something for the people dataset, but Toronto mode
    // still needs the row: it holds the control that finds the five
    // plaques you can speak with.
    voicesOnly = false;
    renderFilters();
    el.filters.hidden = isToronto() && !el.filters.children.length;

    const credit = document.getElementById("atlasCredit");
    if (credit) {
      credit.textContent = isToronto()
        ? "Plaque locations and text from Heritage Toronto's published Exploration Map, a selected set. Albert Jackson's own 2017 plaque is not part of it."
        : "Birth pins are approximate to the town or district. Canadian pins sit at the grave where the record gives one, otherwise at the place of death, offset slightly so neighbours in one city can be told apart. Summaries load live from Wikipedia.";
    }

    const title = document.getElementById("atlasTitle");
    const lede = document.getElementById("atlasLede");
    if (isToronto()) {
      title.textContent = "The city, plaque by plaque";
      lede.textContent =
        "Every plaque on Heritage Toronto's published Exploration Map, placed on the street where it stands. Five of them will answer you. Look for the gold markers.";
      el.query.placeholder = "Search a street, building or name...";
    } else {
      title.innerHTML = "Every pin<br/>is a life";
      lede.textContent =
        "Sixty-eight lives pinned where they began, and five hundred more pinned where they ended, across Canada. Zoom in and the crowds come apart.";
      el.query.placeholder = "Search a name, country or century...";
    }

    // Leaving Toronto plaques always returns you to the globe.
    surface = isToronto() ? "street" : "globe";
    applySurface();

    if (isToronto()) {
      buildMap();
      // Leaflet needs a size recalculation once its container is visible.
      requestAnimationFrame(() => {
        lmap.invalidateSize();
        lmap.setView([43.68, -79.38], 12, { animate: false });
      });
    }

    renderFilters();
    applyFilters();

    if (!isToronto()) {
      stylePoints();
      setSpinning(false);
      if (world) {
        world.pointOfView({ lat: 22, lng: -40, altitude: 2.2 }, prefersReduced ? 0 : 1400);
      }
    }
  }

  /* Pins are sized in degrees of arc, so a radius that reads well from
     orbit becomes a blob up close. Scale it with camera altitude, which
     is what lets a crowded city separate as you zoom in. */
  function currentAltitude() {
    try {
      const pov = world && world.pointOfView();
      return pov && isFinite(pov.altitude) ? pov.altitude : 2.2;
    } catch {
      return 2.2;
    }
  }

  /* Square root, not linear: scaling straight with altitude shrinks pins
     as fast as the view magnifies, so they never get easier to hit. This
     lets a cluster separate while each pin stays clickable. */
  function pinScale() {
    const alt = currentAltitude();
    return Math.max(0.16, Math.min(1, Math.sqrt(alt / 2.2)));
  }

  function stylePoints() {
    if (!world) return;
    const k = pinScale();
    world
      .pointColor((p) => (isToronto() ? PLAQUE_COLOR : colorFor(p)))
      .pointAltitude((p) => (selected && sameEntry(selected, p) ? 0.09 * k : 0.035 * k))
      .pointRadius((p) => (selected && sameEntry(selected, p) ? 0.42 * k : 0.3 * k));
  }

  /* Re-scale while the visitor zooms, but only when the altitude has
     moved enough to matter: the change event fires every frame. */
  function watchZoom() {
    const controls = world && world.controls();
    if (!controls) return;
    let last = currentAltitude();
    let queued = false;
    controls.addEventListener("change", () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        const now = currentAltitude();
        // Wheel-zoomed past the point where the globe has anything left
        // to draw: hand over to the street map.
        if (surface === "globe" && !isToronto() && now < HANDOFF_ALTITUDE) {
          handOff(world.pointOfView());
          return;
        }
        if (Math.abs(now - last) / Math.max(last, 0.001) > 0.06) {
          last = now;
          stylePoints();
        }
      });
    });
  }

  function zoomBy(factor) {
    if (surface === "street") {
      if (lmap) lmap.setZoom(lmap.getZoom() + (factor < 1 ? 1 : -1));
      return;
    }
    if (!world) return;
    setSpinning(false);
    const pov = world.pointOfView();
    const alt = Math.max(0.03, Math.min(4.5, pov.altitude * factor));

    if (alt < HANDOFF_ALTITUDE) {
      handOff(pov);
      return;
    }
    world.pointOfView({ lat: pov.lat, lng: pov.lng, altitude: alt }, prefersReduced ? 0 : 420);
    setTimeout(stylePoints, prefersReduced ? 10 : 460);
  }

  /* ---------- Globe <-> street handoff ---------- */

  /* Zooming in is almost always aimed at something. If a person is
     selected, land on them rather than on wherever the camera happened
     to be pointing, which is how the first attempt put Glenn Gould's
     grave off-screen over Lake Michigan. */
  function handOff(pov) {
    if (selected && isFinite(selected.lat) && isFinite(selected.lng)) {
      toStreet(selected.lat, selected.lng, 15);
    } else {
      toStreet(pov.lat, pov.lng, 11);
    }
  }

  async function toStreet(lat, lng, zoom) {
    if (handingOff || surface === "street") return;
    handingOff = true;
    try {
      if (!(await ensureLeaflet())) return;   // stay on the globe if it fails
      setSpinning(false);
      surface = "street";
      applySurface();
      buildMap();
      requestAnimationFrame(() => {
        lmap.invalidateSize();
        lmap.setView([lat, lng], zoom, { animate: false });
        paintMarkers();
      });
    } finally {
      handingOff = false;
    }
  }

  function toGlobe(lat, lng, altitude) {
    if (surface === "globe") return;
    surface = "globe";
    applySurface();
    if (world) {
      world.pointOfView(
        { lat: lat, lng: lng, altitude: altitude || 0.9 },
        prefersReduced ? 0 : 700
      );
      world.pointsData(visible);
      setTimeout(stylePoints, prefersReduced ? 10 : 760);
    }
  }

  /* Show whichever instrument is current, and label the escape hatch. */
  function applySurface() {
    const street = surface === "street" || isToronto();
    el.map.hidden = !street;
    el.globe.hidden = street;
    el.spin.hidden = street;
    // Leaflet brings its own zoom control, so ours only shows on the globe.
    const zoomGroup = document.getElementById("atlasZoom");
    if (zoomGroup) zoomGroup.hidden = street;

    const homeLabel = document.getElementById("atlasHomeLabel");
    if (homeLabel) {
      homeLabel.textContent = isToronto()
        ? "Toronto"
        : surface === "street"
        ? "Back to globe"
        : "Albert";
    }
  }

  /* On the street map, zooming far enough out returns to the globe. */
  function watchStreetZoom() {
    if (!lmap) return;
    // Zooming changes which voice labels fit without overlapping.
    lmap.on("zoomend", thinLabels);
    lmap.on("zoomend", () => {
      if (isToronto() || surface !== "street") return;
      if (lmap.getZoom() <= RETURN_ZOOM) {
        const c = lmap.getCenter();
        toGlobe(c.lat, c.lng, 0.9);
      }
    });
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
    s.textContent = isToronto()
      ? firstLine(p.text)
      : [yearText(p), p.place].filter(Boolean).join("  ·  ");
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
      // The globe's radius is 100 units, so a minDistance of 160 clamped
      // the camera at roughly altitude 0.6 and made city-scale zoom
      // impossible. Allow it close enough to read a neighbourhood.
      controls.minDistance = 102;
      controls.maxDistance = 620;
      controls.enableZoom = true;
      controls.zoomSpeed = 0.8;
      // Any manual interaction stops the drift.
      controls.addEventListener("start", () => {
        if (spinning) setSpinning(false);
      });
    }
    watchZoom();

    stylePoints();
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

    const zin = document.getElementById("atlasZoomIn");
    const zout = document.getElementById("atlasZoomOut");
    if (zin) zin.addEventListener("click", () => zoomBy(0.6));
    if (zout) zout.addEventListener("click", () => zoomBy(1 / 0.6));

    document.getElementById("modeWorld").addEventListener("click", () => setMode("world"));
    document.getElementById("modeToronto").addEventListener("click", () => setMode("toronto"));

    // One click from anywhere: switch to the plaques, keep only the five
    // that speak, and frame them.
    const hint = document.getElementById("atlasVoicesHint");
    if (hint) {
      hint.addEventListener("click", async () => {
        if (!isToronto()) await setMode("toronto");
        voicesOnly = true;
        renderFilters();
        applyFilters();
        fitToVisible();
      });
    }

    el.home.addEventListener("click", () => {
      if (isToronto()) {
        if (lmap) lmap.setView([43.68, -79.38], 12, { animate: !prefersReduced });
        return;
      }
      if (surface === "street") {
        const c = lmap ? lmap.getCenter() : { lat: 20, lng: -40 };
        toGlobe(c.lat, c.lng, 1.1);
        return;
      }
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
      resizeTimer = setTimeout(() => {
        sizeGlobe();
        if (lmap) lmap.invalidateSize();
      }, 120);
    });
  }

  /* The loading screen waits for the globe on this page, not for window
     load, because the globe is drawn a long way after it. Every exit from
     init() has to call this: an error message is no use behind a screen
     that says the world is being drawn. */
  function dismissPreloader() {
    if (window.Preloader) window.Preloader.done();
  }

  function fail(message) {
    el.loading.innerHTML = "";
    const p = document.createElement("span");
    p.textContent = message;
    el.loading.appendChild(p);
    dismissPreloader();
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
    dismissPreloader();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
