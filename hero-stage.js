/* ============================================================
   Stage hero  |  stars, a turning planet, and the people on it
   ------------------------------------------------------------
   Three layers, each degrading on its own:

     stars   canvas, always on except reduced-motion
     planet  globe.gl, wide screens only, fetched lazily
     faces   portrait medallions of figures from the atlas,
             pulled from Wikipedia, falling back to initials

   Anything that fails leaves a finished-looking night sky.
   ============================================================ */

(function () {
  "use strict";

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const GLOBE_SRC = "https://unpkg.com/globe.gl@2.34.4/dist/globe.gl.min.js";
  const COUNTRIES = [
    "https://unpkg.com/globe.gl/example/datasets/ne_110m_admin_0_countries.geojson",
    "https://cdn.jsdelivr.net/npm/globe.gl/example/datasets/ne_110m_admin_0_countries.geojson",
  ];

  const starsEl = document.getElementById("stageStars");
  const planetEl = document.getElementById("stagePlanet");
  const facesEl = document.getElementById("stageFaces");
  if (!starsEl && !planetEl && !facesEl) return;

  /* ---------------- Stars ---------------- */

  function runStars() {
    if (!starsEl || reduced.matches) return;
    const ctx = starsEl.getContext("2d");
    if (!ctx) return;

    let w = 0, h = 0, dpr = 1, stars = [], raf = null, visible = true;

    function resize() {
      const r = starsEl.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width; h = r.height;
      starsEl.width = Math.round(w * dpr);
      starsEl.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Density scaled to area, capped so phones stay cheap.
      const count = Math.min(260, Math.round((w * h) / 7000));
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.25 + 0.25,
        vx: (Math.random() * 0.16 + 0.02) * (Math.random() < 0.5 ? -1 : 1),
        vy: (Math.random() * 0.06 + 0.01) * -1,
        tw: Math.random() * Math.PI * 2,
        tws: Math.random() * 0.02 + 0.004,
        warm: Math.random() < 0.3,
      }));
    }

    function frame() {
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        s.x += s.vx;
        s.y += s.vy;
        s.tw += s.tws;
        if (s.x < -4) s.x = w + 4;
        if (s.x > w + 4) s.x = -4;
        if (s.y < -4) s.y = h + 4;

        const a = 0.32 + Math.sin(s.tw) * 0.3;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = s.warm
          ? "rgba(226,200,140," + a.toFixed(3) + ")"
          : "rgba(232,238,250," + a.toFixed(3) + ")";
        ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    }

    function start() { if (!raf && visible) frame(); }
    function stop() { if (raf) cancelAnimationFrame(raf), (raf = null); }

    resize();
    start();

    let t = null;
    window.addEventListener("resize", () => {
      clearTimeout(t);
      t = setTimeout(resize, 150);
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stop();
      else start();
    });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(
        (entries) => {
          visible = entries[0].isIntersecting;
          if (visible) start();
          else stop();
        },
        { threshold: 0.02 }
      ).observe(starsEl);
    }
  }

  /* ---------------- Planet ---------------- */

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (typeof window.Globe === "function") return resolve();
      const s = document.createElement("script");
      s.src = src; s.async = true;
      s.onload = resolve;
      s.onerror = () => reject(new Error("globe.gl"));
      document.head.appendChild(s);
    });
  }

  async function loadJSON(urls) {
    for (const url of [].concat(urls)) {
      try {
        const res = await fetch(url);
        if (res.ok) return await res.json();
      } catch { /* next mirror */ }
    }
    return null;
  }

  let world = null;

  async function runPlanet(atlas) {
    if (!planetEl || reduced.matches || window.innerWidth < 900) return;
    try {
      await loadScript(GLOBE_SRC);
    } catch {
      return;
    }
    if (typeof window.Globe !== "function") return;

    const geo = await loadJSON(COUNTRIES);
    const countries = geo && Array.isArray(geo.features) ? geo.features : null;
    const people = atlas && Array.isArray(atlas.people) ? atlas.people : [];

    world = Globe()(planetEl)
      .backgroundColor("rgba(0,0,0,0)")
      .showAtmosphere(true)
      .atmosphereColor("#C39A50")
      .atmosphereAltitude(0.2)
      .showGraticules(!countries);

    try {
      const mat = world.globeMaterial();
      if (mat) {
        if (mat.color) mat.color.set("#101d33");
        if (mat.emissive) mat.emissive.set("#1d3054");
        if ("emissiveIntensity" in mat) mat.emissiveIntensity = 0.18;
        if ("shininess" in mat) mat.shininess = 5;
      }
    } catch { /* default material still renders */ }

    if (countries) {
      world
        .polygonsData(countries)
        .polygonCapColor(() => "#EFE4CD")
        .polygonSideColor(() => "rgba(195,154,80,0.3)")
        .polygonStrokeColor(() => "#C39A50")
        .polygonAltitude(0.008)
        .polygonsTransitionDuration(0);
    }

    if (people.length) {
      const TORONTO = new Set(["albert-jackson", "ann-maria-jackson"]);
      world
        .pointsData(people)
        .pointLat("lat").pointLng("lng")
        .pointColor((p) => (TORONTO.has(p.id) ? "#A02B22" : "#C39A50"))
        .pointAltitude((p) => (TORONTO.has(p.id) ? 0.05 : 0.026))
        .pointRadius((p) => (TORONTO.has(p.id) ? 0.42 : 0.3))
        .pointsTransitionDuration(0);
    }

    const c = world.controls();
    if (c) {
      c.enabled = false;               // decorative: never eats a scroll
      c.autoRotate = true;
      c.autoRotateSpeed = 0.38;
    }
    world.pointOfView({ lat: 18, lng: -55, altitude: 1.85 }, 0);

    const size = () => {
      const r = planetEl.getBoundingClientRect();
      if (r.width > 0) world.width(r.width).height(r.height);
    };
    size();
    planetEl.classList.add("live");

    let t = null;
    window.addEventListener("resize", () => {
      clearTimeout(t);
      t = setTimeout(size, 160);
    });

    // Stop turning when the hero is off screen or the tab is hidden.
    const spin = (on) => { if (world.controls()) world.controls().autoRotate = on; };
    document.addEventListener("visibilitychange", () => spin(!document.hidden));
    if ("IntersectionObserver" in window) {
      new IntersectionObserver((e) => spin(e[0].isIntersecting), { threshold: 0.03 })
        .observe(planetEl);
    }
  }

  /* ---------------- Faces ---------------- */

  // Placed clear of the copy column, around the planet's limb.
  const SLOTS = [
    { id: "harriet-tubman",     x: "59%", y: "24%", s: "86px",  d: "0.25s", dur: "7.5s" },
    { id: "nelson-mandela",     x: "79%", y: "33%", s: "104px", d: "0.5s",  dur: "9s"   },
    { id: "marie-curie",        x: "66%", y: "55%", s: "78px",  d: "0.75s", dur: "8.2s" },
    { id: "albert-jackson",     x: "87%", y: "60%", s: "112px", d: "0.1s",  dur: "8.8s" },
    { id: "frida-kahlo",        x: "57%", y: "73%", s: "72px",  d: "0.95s", dur: "7.1s" },
    { id: "mahatma-gandhi",     x: "78%", y: "80%", s: "80px",  d: "1.15s", dur: "9.4s" },
  ];

  async function runFaces(atlas) {
    if (!facesEl || window.innerWidth < 900) return;
    const people = atlas && Array.isArray(atlas.people) ? atlas.people : [];
    if (!people.length) return;

    for (const slot of SLOTS) {
      const person = people.find((p) => p.id === slot.id);
      if (!person) continue;

      const node = document.createElement("div");
      node.className = "stage-face";
      node.style.setProperty("--fx", slot.x);
      node.style.setProperty("--fy", slot.y);
      node.style.setProperty("--fs", slot.s);
      node.style.setProperty("--fdelay", slot.d);
      node.style.setProperty("--fdur", slot.dur);

      // Initials show immediately; a portrait replaces them if one loads.
      const initials = document.createElement("span");
      initials.textContent = person.name
        .split(/\s+/).slice(0, 2).map((w) => w[0]).join("");
      node.appendChild(initials);
      facesEl.appendChild(node);

      loadPortrait(person, node);
    }
  }

  async function loadPortrait(person, node) {
    const title = (person.wiki || person.name).replace(/ /g, "_");
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 7000);
      const res = await fetch(
        "https://en.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(title),
        { signal: ctrl.signal, headers: { Accept: "application/json" } }
      );
      clearTimeout(timer);
      if (!res.ok) return;
      const data = await res.json();
      const src = data && data.thumbnail && data.thumbnail.source;
      if (!src) return;

      const img = new Image();
      img.alt = "";
      img.decoding = "async";
      img.onload = () => {
        node.insertBefore(img, node.firstChild);
        const span = node.querySelector("span");
        if (span) span.remove();
      };
      img.src = src;
    } catch {
      /* initials stay */
    }
  }

  /* ---------------- Boot ---------------- */

  runStars();

  const start = async () => {
    const atlas = await loadJSON("data/people.json");
    runFaces(atlas);
    runPlanet(atlas);
  };

  const kick = () => {
    if (window.requestIdleCallback) requestIdleCallback(start, { timeout: 2500 });
    else setTimeout(start, 400);
  };

  if (document.readyState === "complete") kick();
  else window.addEventListener("load", kick);
})();
