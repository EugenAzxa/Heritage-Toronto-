/* ============================================================
   Preloader  |  dismissing the loading screen
   ------------------------------------------------------------
   The screen itself is markup and CSS, so it is on screen in
   the first painted frame. This file only decides when it
   leaves.

   The whole design goal is that it cannot outlive its page.
   There are three independent ways it goes away, and only the
   first one needs this script to work at all:

     1. this script, on window load
     2. a CSS animation at 6s, which runs whether or not this
        file was ever fetched or parsed
     3. <noscript>, which removes it outright

   MIN exists so a cached load does not flash the screen for
   80ms; MAX exists so a hanging image cannot hold the page
   hostage. Neither adds time to a normal load.
   ============================================================ */

(function () {
  "use strict";

  const el = document.getElementById("preloader");
  if (!el) return;

  const MIN_MS = 420;   // floor, so a fast load reads as deliberate not broken
  const MAX_MS = 5000;  // ceiling, so a stalled asset never traps the visitor
  const FADE_MS = 620;  // must clear the CSS transition on .preloader

  const started = Date.now();
  let finished = false;

  function dismiss() {
    if (finished) return;
    finished = true;

    const waited = Date.now() - started;
    const hold = Math.max(0, MIN_MS - waited);

    setTimeout(function () {
      el.classList.add("is-done");
      // Take it out of the document entirely once it has faded, so it can
      // never intercept a click or a tab stop.
      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, FADE_MS);
    }, hold);
  }

  /* Pages with more to do than load their own assets can say when they
     are actually ready. The atlas uses this: its globe is drawn well
     after window load. */
  window.Preloader = { done: dismiss };

  if (document.readyState === "complete") dismiss();
  else window.addEventListener("load", dismiss);

  setTimeout(dismiss, MAX_MS);

  /* Coming back via the back button restores the page from cache with
     the preloader still in the DOM if it was mid-fade when we left. */
  window.addEventListener("pageshow", function (e) {
    if (e.persisted) dismiss();
  });
})();
