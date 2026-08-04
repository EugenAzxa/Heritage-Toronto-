/* ============================================================
   Split hero  |  the cropped, rotating half globe
   ------------------------------------------------------------
   Boots a decorative globe in the right-hand pane. Deliberately
   conservative about when it runs:

     - only on wide screens (below 860px the CSS sphere is used)
     - never with prefers-reduced-motion
     - globe.gl is fetched only once those checks pass, so phones
       and reduced-motion visitors never download it at all
     - rotation pauses when the hero scrolls away, when the tab is
       hidden, and while the pointer is over the pane

   If anything here fails, the CSS sphere underneath is already
   painted and the pane still looks finished.
   ============================================================ */

(function () {
  "use strict";

  const MIN_WIDTH = 860;
  const GLOBE_SRC = "https://unpkg.com/globe.gl@2.34.4/dist/globe.gl.min.js";
  const COUNTRIES = [
    "https://unpkg.com/globe.gl/example/datasets/ne_110m_admin_0_countries.geojson",
    "https://cdn.jsdelivr.net/npm/globe.gl/example/datasets/ne_110m_admin_0_countries.geojson",
  ];

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

  const mount = document.getElementById("heroGlobe");
  if (!mount) return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (reduced.matches) return;
  if (window.innerWidth < MIN_WIDTH) return;

  let world = null;
  let onScreen = true;
  let hovered = false;

  /* Rotation runs only when the hero is visible, the tab is focused,
     and the visitor is not trying to read over the top of it. */
  function refreshSpin() {
    if (!world) return;
    const controls = world.controls();
    if (!controls) return;
    controls.autoRotate = onScreen && !document.hidden && !hovered;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (typeof window.Globe === "function") return resolve();
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = () => reject(new Error("failed to load " + src));
      document.head.appendChild(s);
    });
  }

  async function loadJSON(urls) {
    for (const url of [].concat(urls)) {
      try {
        const res = await fetch(url);
        if (res.ok) return await res.json();
      } catch {
        /* try the next mirror */
      }
    }
    return null;
  }

  function size() {
    if (!world) return;
    const r = mount.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) world.width(r.width).height(r.height);
  }

  async function boot() {
    try {
      await loadScript(GLOBE_SRC);
    } catch {
      return; // CSS sphere stays; nothing else to do
    }
    if (typeof window.Globe !== "function") return;

    const [countries, atlas] = await Promise.all([
      loadJSON(COUNTRIES),
      loadJSON("data/people.json"),
    ]);

    const people = atlas && Array.isArray(atlas.people) ? atlas.people : [];

    world = Globe()(mount)
      .backgroundColor("rgba(0,0,0,0)")
      .showAtmosphere(true)
      .atmosphereColor("#C39A50")
      .atmosphereAltitude(0.15)
      .showGraticules(!countries);

    try {
      const mat = world.globeMaterial();
      if (mat) {
        if (mat.color) mat.color.set("#132038");
        if (mat.emissive) mat.emissive.set("#1d3054");
        if ("emissiveIntensity" in mat) mat.emissiveIntensity = 0.16;
        if ("shininess" in mat) mat.shininess = 4;
      }
    } catch {
      /* default material still renders */
    }

    if (countries) {
      world
        .polygonsData(countries)
        .polygonCapColor(() => "#EFE4CD")
        .polygonSideColor(() => "rgba(195,154,80,0.28)")
        .polygonStrokeColor(() => "#C39A50")
        .polygonAltitude(0.008)
        .polygonsTransitionDuration(0);
    }

    if (people.length) {
      world
        .pointsData(people)
        .pointLat("lat")
        .pointLng("lng")
        .pointColor((p) => FIELD_COLOR[p.field] || "#C39A50")
        .pointAltitude(0.03)
        .pointRadius(0.28)
        .pointsTransitionDuration(0);
    }

    const controls = world.controls();
    if (controls) {
      controls.enabled = false; // decorative: never steals scroll or drag
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.42;
    }

    // Tilt toward the northern hemisphere, where most pins sit.
    world.pointOfView({ lat: 22, lng: -40, altitude: 2.1 }, 0);

    size();
    mount.classList.add("live"); // cross-fades the CSS sphere out
    refreshSpin();
  }

  /* ---- Pause conditions ---- */

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          onScreen = e.isIntersecting;
          refreshSpin();
        });
      },
      { threshold: 0.05 }
    ).observe(mount);
  }

  document.addEventListener("visibilitychange", refreshSpin);

  const pane = mount.closest(".split-pane");
  if (pane) {
    pane.addEventListener("mouseenter", () => {
      hovered = true;
      refreshSpin();
    });
    pane.addEventListener("mouseleave", () => {
      hovered = false;
      refreshSpin();
    });
  }

  // If the visitor turns reduced motion on mid-visit, stop.
  const onReducedChange = () => {
    if (reduced.matches && world) {
      const c = world.controls();
      if (c) c.autoRotate = false;
    }
  };
  if (reduced.addEventListener) reduced.addEventListener("change", onReducedChange);

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(size, 150);
  });

  /* ---- Start once the page is done with more important work ---- */
  const start = () => {
    if (window.requestIdleCallback) requestIdleCallback(boot, { timeout: 2500 });
    else setTimeout(boot, 400);
  };

  if (document.readyState === "complete") start();
  else window.addEventListener("load", start);
})();
