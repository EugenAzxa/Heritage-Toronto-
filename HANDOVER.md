# Handover

A working demonstration site built by **Saylavy** to pitch a collaboration to
**Heritage Toronto**. It is not a tribute site that happens to mention a
partnership; it is a proposal, and the Albert Jackson story is the worked
example inside it. Keep that order straight when deciding what to build next.

---

## Live

| | |
| --- | --- |
| **Site** | <https://www.saylavy.info> |
| Apex | `saylavy.info` → 308 → `www`, paths preserved |
| Host | **Vercel**, project imported from this repo |
| Deploy | **push to `main`** — Vercel rebuilds automatically |
| Repo | `EugenAzxa/Heritage-Toronto-` |

GitHub Pages is also enabled and serves at `eugenazxa.github.io/Heritage-Toronto-`
as a backup URL. It is deliberately *not* the production host: the domain was
already pointed at Vercel from an earlier project, and the GoDaddy zone holding
GitHub's A records turned out not to be the zone the domain is delegated to.
There is no `CNAME` file, and there should not be one — it would make Pages
claim the domain and fight Vercel for it.

`vercel.json` pins this as a static deploy. That matters: the repo contains a
`package.json` under `worker/` and another under `videos/`, and framework
auto-detection would otherwise try to build one of them.

---

## The one thing that is not wired

**`window.ALBERT_API` is empty in `index.html` and `people.html`.**

That single blank string is the difference between a live AI demonstration and
a scripted FAQ. With it empty:

- Albert answers from the offline keyword knowledge base, and the badge reads
  **Offline**
- the five plaque voices greet you, speak their opening line aloud, and then
  say *"not connected on this build"* if you ask anything

To turn it on:

```bash
cd worker
npm install
npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler deploy
```

Then set `ALLOWED_ORIGINS` in `worker/wrangler.toml` to
`https://www.saylavy.info,https://saylavy.info` and redeploy, and paste the
printed Worker URL into `window.ALBERT_API` in **both** HTML files. It is easy
to do one and forget the other.

---

## Also outstanding

- **`assets/heritage-toronto.png` does not exist.** Three places are wired to
  show Heritage Toronto's logo the moment that file lands: the header lockup on
  both pages and the "Heritage Toronto keeps" column in the collaboration
  section. Until then each falls back to the typed wordmark and nothing breaks.
  Prefer an SVG — if you have one, save it as `.svg` and change the extension in
  `index.html`, `people.html` and `styles.css`.
- **Touch gestures untested on real hardware.** Pinch-zoom on the globe and the
  Leaflet map were never tried on an actual phone, only at phone viewports.
- The **old Vercel statistics project** may still hold stale domain entries.
  Harmless now that the heritage project serves the domain, but worth tidying.

---

## What is in here

| Path | What it is |
| --- | --- |
| `index.html` | Home. Hero, story, Speak with Albert, legacy, sources, collaboration proposal, film |
| `people.html` | Atlas. Globe of 510 Canadian lives + 312 plaques on a street map |
| `script.js` | Albert's chat, speech synthesis, the animated portrait |
| `voices.js` | The five plaque voices: data, portraits, chat panel, speech |
| `people.js` | The atlas: globe, Leaflet map, search, cards, globe↔street handoff |
| `hero-stage.js` | Home hero: starfield, turning planet, the six portrait medallions |
| `preloader.js` / `nav.js` / `interactions.js` / `film.js` | Loading screen, mobile menu, press feedback, YouTube facade |
| `worker/` | Cloudflare Worker holding the API key. `personas.js` is the grounding for all six voices |
| `data/people.json` | 510 lives, all in Canada |
| `data/plaques.json` | 312 Heritage Toronto plaques, verbatim text |
| `data/voices.json` | The five that speak — browser-side metadata only |
| `videos/saylavy-intro/` | HyperFrames project; renders a 10s motion piece to `renders/video.mp4` |
| `DEPLOY.md` | Deployment notes (GitHub Pages era; Vercel is now the host) |

---

## Decisions worth not undoing

**The API key never touches the browser.** That is the entire reason the
Cloudflare Worker exists. `worker/.dev.vars` is gitignored.

**Five voices, not 312.** The expensive part is not tokens, it is checking.
Each of the five is grounded in the plaque text quoted verbatim plus a
hand-read encyclopedia condensation, and where the two disagree the
disagreement is written into the record so the voice admits it rather than
picking a side. Auto-generating the other 307 would mean nobody has read what
they are about to say.

**Nothing is invented.** Voices are instructed to say when the record does not
answer. The site says where it is thin. Keep that.

**The mock-ups in the collaboration section are drawn, not photographed.** A
composited photo of a plaque that does not exist, standing in a real Toronto
planting bed, gets forwarded without its caption and read as evidence. A
diagram cannot be.

**The footer affiliation notice stays.** Their logo next to ours with an "×"
between reads as a partnership that exists. It does not yet.

**The QR codes are real.** Generated against the same `?voice=` deep links
`people.js` reads, error correction Q so a plate outdoors survives weather and
scratches, and decoded back out of their own SVGs before shipping. If you
regenerate them, decode them again.

---

## Traps already paid for

- **CSS source order.** Several rules tie on specificity with the `:hover`
  rules above them, so order decides the winner. The interaction layer at the
  end of `styles.css` must stay at the end or nothing presses. This class of
  bug has bitten five times.
- **`minmax(0, 1fr)`, never `1fr`,** for the atlas mobile grid. A grid item
  carries `min-width: auto`, so a `1fr` track cannot shrink below its content's
  min-content width. One nowrap subtitle gave the whole page a horizontal
  scrollbar on every phone under 384px.
- **EXIF orientation 6** on the plaque photos meant browsers rotated already
  upright pixels onto their side. Patch the orientation tag to 1 in place.
  **Do not run it through ffmpeg** — ffmpeg honours EXIF on decode and will
  rotate correct pixels, producing a genuinely sideways file.
- **Do not leave `hyperframes preview` running.** HyperFrames Studio rewrites
  the composition while its server is up. It silently stretched the film from
  10s to 10.89s and that drift got committed.
- **Speech voices are per-device.** Albert prefers `en-CA`; each plaque voice
  carries a `speaks` hint so Montgomery is not read in a man's voice. A Mac
  will pick from its own set.

---

## Running it locally

No build step. Serve the folder and open it:

```bash
npx serve -l 8000
```

Serve it rather than opening `index.html` from disk — both pages fetch JSON,
which `file://` blocks.
