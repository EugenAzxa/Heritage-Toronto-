/* ============================================================
   The proposal film  |  click-to-load YouTube
   ------------------------------------------------------------
   A YouTube iframe costs about a megabyte of player script and
   sets third-party cookies as soon as it exists, whether or not
   anybody presses play. On a page this long, most visitors never
   reach the film at all, so the embed is not built until someone
   asks for it.

   Until then the page holds a still and a play button, which is
   also the only state that exists without JavaScript: the button
   is wrapped in a link to YouTube, so a visitor with no script
   still gets the video, just on YouTube's own page.
   ============================================================ */

(function () {
  "use strict";

  const btn = document.getElementById("filmPlay");
  if (!btn) return;

  btn.addEventListener("click", function (e) {
    const id = btn.getAttribute("data-video");
    if (!id) return;
    // Without this handler the anchor simply opens YouTube, which is the
    // no-JavaScript behaviour and a perfectly good one. With it, the film
    // plays in place instead.
    e.preventDefault();

    const frame = document.createElement("iframe");
    // nocookie: YouTube's privacy-enhanced host. Same player, no cookie
    // until playback actually starts.
    frame.src =
      "https://www.youtube-nocookie.com/embed/" +
      encodeURIComponent(id) +
      "?autoplay=1&rel=0&modestbranding=1&playsinline=1";
    frame.title = btn.getAttribute("data-title") || "Collaboration proposal video";
    frame.allow =
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    frame.allowFullscreen = true;
    frame.loading = "lazy";
    frame.className = "film-embed";

    const wrap = btn.parentNode;
    wrap.replaceChild(frame, btn);
    // Move focus into the player so a keyboard press does not land nowhere.
    frame.focus({ preventScroll: true });
  });
})();
