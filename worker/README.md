# Speak with Albert &middot; Claude API proxy

A Cloudflare Worker that holds the Anthropic API key and streams Claude's replies to the static site. The site itself stays on GitHub Pages; this is the one piece that needs a server, because an API key in browser JavaScript is readable by anyone who opens devtools.

## What it does

| Route | Method | Purpose |
| --- | --- | --- |
| `/chat` | `POST` | Takes `{ messages: [{ role, content }] }`, streams the reply back as SSE |
| `/health` | `GET` | Returns `{ ok, model, configured }` so the site can tell whether the proxy is live |

Albert's persona and the full documented historical record live in [`src/albert-prompt.js`](src/albert-prompt.js). That file is the single source of truth for what he is allowed to assert.

## Deploy

```bash
cd worker
npm install
npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY   # paste the key when prompted
npx wrangler deploy
```

Wrangler prints the deployed URL, e.g. `https://speak-with-albert.<your-subdomain>.workers.dev`.

Then point the site at it. In [`../index.html`](../index.html), set:

```html
<script>window.ALBERT_API = "https://speak-with-albert.your-subdomain.workers.dev";</script>
```

Until that is set (or if the Worker is unreachable), the site falls back to the original offline keyword knowledge base, so the page never breaks.

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

- keeps only the last 16 messages,
- truncates each message to 600 characters,
- rejects conversations over 8000 characters total,
- drops leading assistant turns and requires the conversation to end on a user turn.

## Model settings

- **Model:** `claude-opus-5`
- **Effort:** `low` — keeps chat latency down; thinking stays on by default
- **Prompt caching:** the system prompt carries `cache_control`, so repeat visitors read the grounding record from cache at roughly a tenth of the input cost
- **Refusal fallbacks:** `fallbacks: "default"` so a declined turn is re-served by the recommended fallback model instead of dead-ending

## Cost

Input is dominated by the cached system prompt (~1.2k tokens), which bills at cache-read rates after the first request in a five minute window. A typical exchange is well under a cent. The rate limiter is the real cost control.
