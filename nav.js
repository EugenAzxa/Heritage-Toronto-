/* ============================================================
   Shared header behaviour: the mobile menu.
   Loaded by both index.html and people.html.
   ============================================================ */

(function () {
  "use strict";

  const header = document.getElementById("siteHeader");
  const toggle = document.getElementById("navToggle");
  const nav = document.getElementById("siteNav");
  if (!header || !toggle || !nav) return;

  /* The desktop header has a "Speak with him" call to action that is
     hidden on narrow screens. Mirror it inside the panel so phone
     visitors keep the same primary action. */
  const desktopCta = header.querySelector(".nav-cta");
  if (desktopCta && !nav.querySelector(".nav-cta-mobile")) {
    const mobileCta = document.createElement("a");
    mobileCta.className = "nav-cta-mobile";
    mobileCta.href = desktopCta.getAttribute("href");
    mobileCta.textContent = desktopCta.textContent.trim() || "Speak with him";
    nav.appendChild(mobileCta);
  }

  function setOpen(open) {
    header.classList.toggle("nav-open", open);
    toggle.setAttribute("aria-expanded", String(open));
  }

  const isOpen = () => toggle.getAttribute("aria-expanded") === "true";

  toggle.addEventListener("click", () => setOpen(!isOpen()));

  // Any link closes the panel; same-page anchors would otherwise leave
  // it covering the section the visitor just jumped to.
  nav.addEventListener("click", (e) => {
    if (e.target.closest("a")) setOpen(false);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen()) {
      setOpen(false);
      toggle.focus();
    }
  });

  document.addEventListener("click", (e) => {
    if (isOpen() && !header.contains(e.target)) setOpen(false);
  });

  // Reset state if the viewport grows past the breakpoint while open.
  const wide = window.matchMedia("(min-width: 961px)");
  const onWide = () => {
    if (wide.matches) setOpen(false);
  };
  if (wide.addEventListener) wide.addEventListener("change", onWide);
})();
