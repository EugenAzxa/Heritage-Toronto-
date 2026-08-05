/* ============================================================
   Interaction layer  |  how every button on the site responds
   ------------------------------------------------------------
   One ripple, one press, everywhere. The alternative is each
   control inventing its own feedback, which is how a site
   starts to feel assembled rather than made.

   Delegated from the document rather than bound at load,
   because most of the controls here do not exist at load: the
   atlas builds its list, chips and suggestion buttons at
   runtime, and the voice panel builds its own.

   Honours prefers-reduced-motion by doing nothing at all. The
   CSS still gives those visitors a colour change and a focus
   ring, which is the part that carries meaning.
   ============================================================ */

(function () {
  "use strict";

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  /* Controls that take a ripple. Anything not listed keeps whatever it
     already had; opt a single element out with data-no-ripple. */
  const SELECTOR = [
    ".btn",
    ".nav-cta",
    ".nav-toggle",
    ".suggest",
    // The chat send button carries no class of its own.
    '.chat-input button[type="submit"]',
    ".chat-mic",
    ".atlas-ctrl",
    ".atlas-chip",
    ".atlas-mode",
    ".atlas-ask",
    ".atlas-voices-hint",
    ".atlas-item",
    ".atlas-card-close",
    ".voice-chip",
    ".voice-send",
    ".voice-sound",
    ".voice-close",
    ".lightbox-close",
  ].join(",");

  const RIPPLE_MS = 620;

  document.addEventListener(
    "pointerdown",
    (e) => {
      // Left button and touch only. A right-click is not a press.
      if (e.button !== 0) return;

      const target = e.target.closest(SELECTOR);
      if (!target || target.hasAttribute("data-no-ripple")) return;
      if (target.disabled) return;

      const rect = target.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      // Reach the far corner from wherever the pointer landed, so the
      // ripple always fills the control rather than stopping short.
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const radius = Math.hypot(
        Math.max(x, rect.width - x),
        Math.max(y, rect.height - y)
      );

      const ink = document.createElement("span");
      ink.className = "ripple";
      ink.setAttribute("aria-hidden", "true");
      ink.style.width = ink.style.height = radius * 2 + "px";
      ink.style.left = x - radius + "px";
      ink.style.top = y - radius + "px";

      target.appendChild(ink);
      setTimeout(() => ink.remove(), RIPPLE_MS);
    },
    { passive: true }
  );
})();
