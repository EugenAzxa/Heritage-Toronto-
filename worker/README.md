# Heritage voices &middot; Claude API proxy

A Cloudflare Worker that holds the Anthropic API key and streams Claude's replies to the static site. The site itself stays on GitHub Pages; this is the one piece that needs a server, because an API key in browser JavaScript is readable by anyone who opens devtools.

## What it does

| Route | Method | Purpose |
| --- | --- | --- |
| `/chat` | `POST` | Takes `{ persona?, messages: [{ role, content }] }`, streams the reply back as SSE |
| `/personas` | `GET` | Lists the voices this Worker answers for. Metadata only; the prompts never leave the Worker |
| `/health` | `GET` | Returns `{ ok, model, configured }` so the site can tell whether the proxy is live |

`persona` defaults to `albert`. An unknown id is rejected with a 400 rather than quietly falling back, so a typo on the client shows up as a typo instead of Albert answering for someone else.

## The voices

| id | Who | Grounded in |
| --- | --- | --- |
| `albert` | Albert Jackson, 1857&ndash;1918 | [`src/albert-prompt.js`](src/albert-prompt.js) |
| `hubbard` | William Peyton Hubbard, 1842&ndash;1935 | [`src/personas.js`](src/personas.js) |
| `gould` | Glenn Gould, 1932&ndash;1982 | [`src/personas.js`](src/personas.js) |
| `montgomery` | L. M. Montgomery, 1874&ndash;1942 | [`src/personas.js`](src/personas.js) |
| `macleod` | J. J. R. Macleod, 1876&ndash;1935 | [`src/personas.js`](src/personas.js) |
| `volkoff` | Boris Volkoff, 1900&ndash;1974 | [`src/personas.js`](src/personas.js) |

Those five are Heritage Toronto plaque subjects. Each record is built from the plaque text, quoted verbatim into the prompt, plus a hand-read condensation of the encyclopedia article. Where the plaque and the encyclopedia disagree, the disagreement is written into the record and the voice is instructed to admit it rather than pick a side.

**Why five and not all 312.** The expensive part is not tokens, it is checking. An auto-generated record would let every plaque talk, but nobody would have read what it was going to say. Five is what can be verified by hand. The pattern extends to the rest of the collection when someone has read them.

Shared house style, truthfulness rules and boundaries live in [`src/voice-rules.js`](src/voice-rules.js) so they can only be changed in one place. These files are the single source of truth for what each voice may assert.

The browser needs its own copy of the display metadata (names, dates, suggested questions, which plaque belongs to whom) so the atlas can show the affordance even when the Worker is unreachable. That copy is [`../data/voices.json`](../data/voices.json). Its `plaques` titles are matched verbatim against `../data/plaques.json`; if you rename a voice, change both.

## Deploy

```bash
cd worker
npm install
npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY   # paste the key when prompted
npx wrangler deploy
```

Wrangler prints the deployed URL, e.g. `https://speak-with-albert.<your-subdomain>.workers.dev`.

Then point the site at it. The value must be set in **both** pages, because both have talking voices:

```html
<!-- index.html  (Albert)  and  people.html  (the five plaques) -->
<script>window.ALBERT_API = "https://speak-with-albert.your-subdomain.workers.dev";</script>
```

Until that is set, or if the Worker is unreachable, `index.html` falls back to the offline keyword knowledge base and the atlas says plainly that the live voice is not connected. Neither page breaks.

Set `ALLOWED_ORIGINS` in `wrangler.toml` to the production domain before going live, or any site can spend your tokens.

## Local development

```bash
cd worker
npm install
echo 'ANTHROPIC_API_KEY = "sk-ant-..."' > .dev.vars
npx wrangler dev          # serves on http://localhost:8787
```

Then serve the site from the project root and set `window.ALBERT_API = "http://localhost:8787"`.

`.dev.vars` is gitignored. Never commit a key.

## Configuration

| Setting | Where | Notes |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | secret | `wrangler secret put ANTHROPIC_API_KEY` |
| `ALLOWED_ORIGINS` | `wrangler.toml` `[vars]` | Comma-separated. Empty accepts any origin, which is fine locally and wrong in production. |
| `RATE_LIMITER` | `wrangler.toml` | 20 requests per minute per IP. Delete the block to disable. |

## Request shaping

The Worker does not trust the browser. Before anything reaches Anthropic it:

- rejects an unknown `persona`,
- keeps only the last 16 messages,
- truncates each message to 600 characters,
- rejects conversations over 8000 characters total,
- drops leading assistant turns and requires the conversation to end on a user turn.

## Model settings

- **Model:** `claude-opus-5`
- **Effort:** `low` — keeps chat latency down; thinking stays on by default
- **Prompt caching:** each persona's system prompt carries its own `cache_control`, so a busy plaque is read from cache at roughly a tenth of the input cost after the first request
- **Refusal fallbacks:** `fallbacks: "default"` so a declined turn is re-served by the recommended fallback model instead of dead-ending

## Cost

Input is dominated by the cached system prompt, roughly 1.2k to 1.8k tokens depending on the voice, which bills at cache-read rates after the first request in the cache window. A typical exchange is well under a cent. Six personas means six cache entries rather than one, so the first request to each voice pays full input price; after that it is the same economics as one. The rate limiter is the real cost control.
