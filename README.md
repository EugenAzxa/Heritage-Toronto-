# Albert Jackson &middot; An Interactive Heritage Toronto Tribute

An immersive, single-page website telling the story of **Albert Jackson (1857&ndash;1918)**, Toronto's first Black letter carrier. Born into slavery in Delaware, carried north to freedom on the Underground Railroad by his mother Ann Maria Jackson, and reinstated to his mail route in 1882 after Toronto's Black community organized to defend his appointment.

The centrepiece is an interactive **"Speak with Albert"** conversation, where visitors can ask Albert about his life and receive first-person answers drawn from the documented historical record.

## Experience

- **Cinematic hero** with the 2019 Canada Post commemorative stamp.
- **Scroll-driven storyline** in nine chapters, from a Delaware slave cabin to a Toronto laneway that carries his name.
- **Speak with Albert** &mdash; a conversational interface. Ask a question or tap a suggested one, and Albert responds in his own voice, streamed live from the Claude API and grounded in the documented record. With no proxy configured it falls back to a built-in offline knowledge base, so the page always works.
- **Atlas of Lives** &mdash; a second page with an interactive 3D globe of 68 notable figures from every inhabited continent, pinned at their birthplace. Search by name, country, field or century; each pin opens a card with a live Wikipedia summary.
- **Legacy** section covering the 2013 Albert Jackson Lane, the 2017 Heritage Toronto plaque, the 2019 national stamp, and the 2024 National Historic Person designation, with the official plaque text transcribed.
- **Gallery** with a lightbox and full source credits.
- Fully **responsive** (375px to desktop), **keyboard accessible**, WCAG AA contrast throughout, and respects `prefers-reduced-motion`.

## Run it locally

No build step. It is plain HTML, CSS, and JavaScript.

```bash
# from the project folder, whichever you have
npx serve -l 8000
python3 -m http.server 8000
# then open http://localhost:8000
```

Serve it rather than opening `index.html` from disk: the atlas fetches `data/people.json`, which `file://` blocks.

### Optional developer tooling

Neither of these is needed to run the site, and both are gitignored.

- **`.claude/skills/`** &mdash; the [ui-ux-pro-max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) design skill pack (MIT), used for the accessibility and layout review. Reinstall with `git clone --depth 1 https://github.com/nextlevelbuilder/ui-ux-pro-max-skill` then copy its `.claude/skills/*` here. Its search tool needs Python 3.
- **`.mcp.json`** is committed and wires up the Playwright MCP server for browser-based checks. Approve it once, or add `"enabledMcpjsonServers": ["playwright"]` to `.claude/settings.local.json`.

## Deploy (GitHub Pages)

Push to `main`, then in the repository settings enable **Pages** with the source set to the `main` branch, root folder. The site is static and needs no server.

## Structure

```
index.html        The tribute page, markup and all copy
people.html       Atlas of Lives, the interactive 3D globe
styles.css        Heritage-postal design system (navy, crimson, brass, parchment)
people.css        Atlas-specific styling, built on the same tokens
script.js         Scroll reveals, lightbox, and the Speak-with-Albert engine
people.js         Globe rendering, search, and Wikipedia lookups
data/people.json  The curated atlas dataset
assets/           Web-ready images (stamp, portrait, plaque, letter carriers)
worker/           Cloudflare Worker proxy for the Claude API (see worker/README.md)
```

## About the "Speak with Albert" engine

Albert answers in two modes, and the page picks whichever is available.

**Live (Claude API).** Deploy the Cloudflare Worker in [`worker/`](worker/) and set `window.ALBERT_API` in `index.html` to its URL. The Worker holds the API key server-side and streams replies back over Server-Sent Events. Albert's persona and the complete documented record he is allowed to draw on live in [`worker/src/albert-prompt.js`](worker/src/albert-prompt.js); the prompt forbids inventing dates, names or quotations, and instructs him to say plainly when the record does not answer a question. A badge in the chat header shows which mode is active.

**Offline (built-in).** With no proxy configured, or if the Worker is unreachable mid-conversation, the page falls back to a hand-written keyword knowledge base (`KB` in `script.js`). Every answer is still accurate and respectful of a real person, and it needs no key, no server, and no network.

The key cannot live in the page itself. Anything shipped to the browser is readable by anyone who opens devtools, which is the whole reason for the proxy.

## About the Atlas of Lives

[`people.html`](people.html) renders [`data/people.json`](data/people.json) as pins on a globe drawn with [globe.gl](https://globe.gl/), styled to the site's palette rather than a satellite photo: navy ocean, parchment landmasses, brass coastlines, and one pin colour per field.

- **Search** covers names, places, fields and eras, including phrases like `19th century` or `1880s`. Press `/` to jump to the search box.
- **Albert and his mother, Ann Maria Jackson,** are both on the globe, pinned in Delaware where the story starts. The Albert button returns the camera there.
- **Wikipedia summaries** load per person on demand and are cached for the session. If the request fails, the card falls back to this site's own written blurb rather than showing an error.
- Coordinates mark the town or district of birth and are approximate.

To add someone, append an entry to `data/people.json`. The `wiki` field must be an exact Wikipedia article title; every title in the file has been verified against the Wikipedia summary API.

## Sources and credits

Historical detail is drawn from the Heritage Toronto plaque (2017) and:

- Heritage Toronto
- Parks Canada, National Historic Person designation (2024)
- The Canadian Encyclopedia
- William Still, *The Underground Railroad* (1872), the primary account of Ann Maria Jackson's escape

Imagery courtesy of Canada Post (stamp illustration by Ron Dollekamp), the Toronto Public Library, and archival collections, used here for educational and commemorative purposes.

Made as a tribute. Albert Jackson's story belongs to the city he served.
