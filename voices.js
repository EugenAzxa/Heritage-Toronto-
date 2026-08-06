/* ============================================================
   Talking plaques  |  the five voices on the atlas
   ------------------------------------------------------------
   Heritage Toronto has 312 plaques. Five of them can be spoken
   with. This module owns that conversation: it loads the voice
   metadata, drives the slide-over panel, and streams replies
   from the Worker.

   Why five and not 312: the expensive part is not the tokens,
   it is the checking. Each voice is grounded in a hand-read
   record so that it declines to invent rather than filling a
   gap. Five is what can be verified. The pattern extends to the
   rest of the collection when someone has read them.

   Exposes window.HeritageVoices:
     ready()          -> Promise, resolves once voices.json is in
     forPlaque(name)  -> voice object or null
     all()            -> array of voices
     open(voice)      -> show the panel and begin a conversation
   ============================================================ */

(function () {
  "use strict";

  const API_BASE = (window.ALBERT_API || "").replace(/\/+$/, "");
  const MAX_TURNS = 16;

  let voices = [];
  const byPlaque = new Map(); // plaque title -> voice
  let loading = null;

  /* Conversation state. One at a time; opening a new voice ends the last. */
  let current = null;
  let currentFace = null;   // portrait URL for the open voice, once it arrives
  let history = [];
  let inFlight = null;
  let speaking = true;

  /* ---------- Data ---------- */

  function ready() {
    if (loading) return loading;
    loading = fetch("data/voices.json")
      .then((r) => {
        if (!r.ok) throw new Error("voices " + r.status);
        return r.json();
      })
      .then((data) => {
        voices = Array.isArray(data.voices) ? data.voices : [];
        voices.forEach((v) => {
          (v.plaques || []).forEach((title) => byPlaque.set(title, v));
        });
        return voices;
      })
      .catch(() => {
        // The atlas still works without talking plaques; it just does not
        // offer them.
        voices = [];
        return voices;
      });
    return loading;
  }

  const forPlaque = (name) => byPlaque.get(name) || null;
  const all = () => voices.slice();

  /* ---------- Portraits ----------
     Faces come from the same Wikipedia summary endpoint the atlas already
     uses for its people, keyed off the wiki title in voices.json. Cached by
     id, including the misses, so a voice with no portrait is not re-fetched
     every time its card opens. Everything downstream treats a null as "show
     the initials", so a failure is never visible as a broken image. */
  const portraits = new Map();

  function portrait(voice) {
    if (!voice) return Promise.resolve(null);
    if (portraits.has(voice.id)) return Promise.resolve(portraits.get(voice.id));

    const title = (voice.wiki || voice.name).replace(/ /g, "_");
    const p = fetch(
      "https://en.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(title),
      { headers: { Accept: "application/json" } }
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (j && j.thumbnail ? j.thumbnail.source : null))
      .catch(() => null)
      .then((src) => {
        portraits.set(voice.id, src);
        return src;
      });

    return p;
  }

  /* ---------- Panel construction ---------- */

  let el = null;

  function build() {
    if (el) return el;

    const root = document.createElement("aside");
    root.className = "voice-panel";
    root.id = "voicePanel";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "false");
    root.setAttribute("aria-labelledby", "voiceName");
    root.hidden = true;

    root.innerHTML = `
      <header class="voice-head">
        <span class="voice-avatar" id="voiceAvatar" aria-hidden="true"></span>
        <span class="voice-id">
          <strong id="voiceName"></strong>
          <em id="voiceRole"></em>
        </span>
        <button type="button" class="voice-sound" id="voiceSound" aria-pressed="true" title="Read the replies aloud">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>
          <span class="sr-only">Read replies aloud</span>
        </button>
        <button type="button" class="voice-close" id="voiceClose" aria-label="End the conversation">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </header>

      <p class="voice-grounding" id="voiceGrounding"></p>

      <div class="voice-log" id="voiceLog" aria-live="polite" aria-atomic="false"></div>

      <div class="voice-chips" id="voiceChips"></div>

      <form class="voice-form" id="voiceForm" autocomplete="off">
        <label class="sr-only" for="voiceInput">Ask a question</label>
        <input id="voiceInput" type="text" maxlength="400" placeholder="Ask a question..." />
        <button type="submit" class="voice-send" id="voiceSend" aria-label="Send">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h15"/><path d="m13 6 6 6-6 6"/></svg>
        </button>
      </form>

      <p class="voice-foot" id="voiceFoot"></p>
    `;

    const stage = document.querySelector(".atlas-stage") || document.body;
    stage.appendChild(root);

    el = {
      root,
      avatar: root.querySelector("#voiceAvatar"),
      name: root.querySelector("#voiceName"),
      role: root.querySelector("#voiceRole"),
      grounding: root.querySelector("#voiceGrounding"),
      log: root.querySelector("#voiceLog"),
      chips: root.querySelector("#voiceChips"),
      form: root.querySelector("#voiceForm"),
      input: root.querySelector("#voiceInput"),
      send: root.querySelector("#voiceSend"),
      sound: root.querySelector("#voiceSound"),
      close: root.querySelector("#voiceClose"),
      foot: root.querySelector("#voiceFoot"),
    };

    el.close.addEventListener("click", close);
    el.form.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = el.input.value.trim();
      if (!text) return;
      el.input.value = "";
      ask(text);
    });
    el.sound.addEventListener("click", () => {
      speaking = !speaking;
      el.sound.setAttribute("aria-pressed", String(speaking));
      if (!speaking) stopSpeaking();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !root.hidden) close();
    });

    return el;
  }

  /* ---------- Speech ---------- */

  const synth = window.speechSynthesis || null;
  let chosenVoice = null;

  function pickVoice() {
    if (!synth) return null;
    if (chosenVoice) return chosenVoice;
    const list = synth.getVoices() || [];
    if (!list.length) return null;
    // Prefer an English voice; anything else is better than nothing.
    chosenVoice =
      list.find((v) => /en-GB/i.test(v.lang)) ||
      list.find((v) => /^en/i.test(v.lang)) ||
      list[0];
    return chosenVoice;
  }
  if (synth) synth.addEventListener?.("voiceschanged", () => (chosenVoice = null));

  function speak(text) {
    if (!speaking || !synth || !text) return;
    stopSpeaking();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) u.voice = v;
    u.rate = 0.96;
    u.pitch = 1;
    synth.speak(u);
  }

  function stopSpeaking() {
    if (synth && (synth.speaking || synth.pending)) synth.cancel();
  }

  /* ---------- Messages ---------- */

  function initials(name) {
    return name
      .replace(/\(.*?\)/g, "")
      .split(/\s+/)
      .filter((w) => /^[A-Za-z]/.test(w))
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join("");
  }

  /* One avatar builder for the header and every message: the portrait when
     it has arrived, the initials until then and if it never does. */
  function avatar(cls) {
    const av = document.createElement("span");
    av.className = cls;
    av.setAttribute("aria-hidden", "true");
    if (currentFace) {
      const img = document.createElement("img");
      img.src = currentFace;
      img.alt = "";
      av.appendChild(img);
    } else {
      av.textContent = current ? initials(current.name) : "";
    }
    return av;
  }

  function addMessage(who, text) {
    const row = document.createElement("div");
    row.className = "voice-msg voice-msg--" + who;

    if (who === "them") row.appendChild(avatar("voice-msg-avatar"));

    const bubble = document.createElement("div");
    bubble.className = "voice-bubble";
    paint(bubble, text);
    row.appendChild(bubble);

    el.log.appendChild(row);
    el.log.scrollTop = el.log.scrollHeight;
    return { row, bubble };
  }

  // Plain prose only; paragraphs on blank lines.
  function paint(node, text) {
    node.textContent = "";
    String(text)
      .split(/\n{2,}/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((para) => {
        const p = document.createElement("p");
        p.textContent = para;
        node.appendChild(p);
      });
    if (!node.childNodes.length) node.textContent = text;
  }

  function showTyping() {
    const row = document.createElement("div");
    row.className = "voice-msg voice-msg--them";
    const av = avatar("voice-msg-avatar");
    const bubble = document.createElement("div");
    bubble.className = "voice-bubble is-typing";
    bubble.innerHTML = "<i></i><i></i><i></i>";
    row.appendChild(av);
    row.appendChild(bubble);
    el.log.appendChild(row);
    el.log.scrollTop = el.log.scrollHeight;
    return { row, bubble };
  }

  function renderChips(list) {
    el.chips.innerHTML = "";
    (list || []).forEach((q) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "voice-chip";
      b.textContent = q;
      b.addEventListener("click", () => ask(q));
      el.chips.appendChild(b);
    });
  }

  function setBusy(on) {
    el.input.disabled = on;
    el.send.disabled = on;
    el.root.classList.toggle("is-busy", on);
  }

  /* ---------- Opening and closing ---------- */

  function open(voice) {
    if (!voice) return;
    build();

    if (inFlight) inFlight.abort();
    stopSpeaking();

    current = voice;
    currentFace = null;
    history = [];

    el.avatar.textContent = initials(voice.name);

    /* The portrait arrives after the panel has already opened, so it is
       painted in when it lands rather than held for. Guarded on `current`
       because a visitor can open a second voice while the first is still
       in flight. */
    portrait(voice).then((src) => {
      if (!src || current !== voice) return;
      currentFace = src;
      el.avatar.textContent = "";
      const img = document.createElement("img");
      img.src = src;
      img.alt = "";
      el.avatar.appendChild(img);
      // Any bubble already on screen gets the face too.
      el.log.querySelectorAll(".voice-msg-avatar").forEach((av) => {
        if (av.querySelector("img")) return;
        av.textContent = "";
        const i2 = document.createElement("img");
        i2.src = src;
        i2.alt = "";
        av.appendChild(i2);
      });
    });
    el.name.textContent = voice.name;
    el.role.textContent = [voice.dates, voice.role].filter(Boolean).join("  ·  ");
    el.grounding.textContent =
      "Grounded in this plaque and the public record. If the record does not answer, " +
      voice.name.split(" ").pop() +
      " says so rather than inventing.";
    el.log.innerHTML = "";
    el.input.value = "";

    el.root.hidden = false;
    el.root.classList.add("is-open");

    if (API_BASE) {
      el.foot.textContent = "Live, and answering as themselves.";
      el.root.classList.remove("is-offline");
      addMessage("them", voice.opening);
      history.push({ role: "assistant", content: voice.opening });
      renderChips(voice.chips);
      speak(voice.opening);
      setBusy(false);
      setTimeout(() => el.input.focus(), 260);
    } else {
      // No Worker configured. Say so plainly rather than faking a reply.
      el.root.classList.add("is-offline");
      el.foot.textContent = "The live voice is not connected on this build.";
      addMessage("them", voice.opening);
      const note = document.createElement("p");
      note.className = "voice-note";
      note.textContent =
        "This voice answers live when the site is connected to its language model. " +
        "It is grounded in the plaque above and in the documented record of " +
        voice.name +
        ", " +
        (voice.dates || "") +
        ".";
      el.log.appendChild(note);
      renderChips([]);
      setBusy(true);
      el.input.placeholder = "Not connected on this build";
    }
  }

  function close() {
    if (!el) return;
    if (inFlight) inFlight.abort();
    stopSpeaking();
    el.root.classList.remove("is-open");
    el.root.hidden = true;
    current = null;
    history = [];
    document.dispatchEvent(new CustomEvent("voice:closed"));
  }

  const isOpen = () => Boolean(el && !el.root.hidden);

  /* ---------- Asking ---------- */

  async function ask(text) {
    if (!current || !API_BASE) return;

    stopSpeaking();
    addMessage("you", text);
    history.push({ role: "user", content: text });
    if (history.length > MAX_TURNS) history = history.slice(-MAX_TURNS);
    renderChips([]);
    setBusy(true);

    const typing = showTyping();
    let acc = "";
    let painted = false;
    inFlight = new AbortController();

    try {
      const res = await fetch(API_BASE + "/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona: current.id, messages: history }),
        signal: inFlight.signal,
      });
      if (!res.ok || !res.body) throw new Error("bad response " + res.status);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let failed = null;

      // SSE frames are separated by a blank line.
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let split;
        while ((split = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, split);
          buffer = buffer.slice(split + 2);

          let event = "message";
          let data = "";
          frame.split("\n").forEach((line) => {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) data += line.slice(5).trim();
          });
          if (!data) continue;

          let payload;
          try {
            payload = JSON.parse(data);
          } catch {
            continue;
          }

          if (event === "delta" && payload.text) {
            acc += payload.text;
            painted = true;
            typing.bubble.classList.remove("is-typing");
            paint(typing.bubble, acc);
            el.log.scrollTop = el.log.scrollHeight;
          } else if (event === "error") {
            failed = payload.message || "Something went wrong.";
          }
        }
      }

      if (!painted) throw new Error(failed || "empty reply");

      history.push({ role: "assistant", content: acc });
      speak(acc);
      renderChips(current.chips);
    } catch (err) {
      if (err && err.name === "AbortError") {
        typing.row.remove();
        return;
      }
      typing.row.remove();
      const note = document.createElement("p");
      note.className = "voice-note";
      note.textContent =
        "That question could not reach " +
        current.name +
        " just now. Try again in a moment.";
      el.log.appendChild(note);
      el.log.scrollTop = el.log.scrollHeight;
      renderChips(current.chips);
    } finally {
      inFlight = null;
      setBusy(false);
      el.input.focus();
    }
  }

  window.HeritageVoices = { ready, forPlaque, all, open, close, isOpen, portrait };
})();
