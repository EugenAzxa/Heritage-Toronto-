# Publishing to saylavy.info

Two independent pieces. The site is static and goes on GitHub Pages. The talking voices need the Cloudflare Worker, because the Anthropic API key can never be in browser JavaScript.

The site works without the Worker. It falls back to the offline knowledge base on the home page, and the atlas says plainly that the live voice is not connected. So step 1 can ship on its own, and the demo is honest either way.

---

## 1. The site on GitHub Pages

The repository already contains a `CNAME` file holding `saylavy.info`. That is the half GitHub reads. The other half is DNS, which has to be set at GoDaddy.

### In the repository

1. Push `main` (already done if you are reading this after the push).
2. **Settings &rarr; Pages**.
3. **Source:** Deploy from a branch. **Branch:** `main`, folder `/ (root)`. Save.
4. Under **Custom domain**, `saylavy.info` should appear, read from the `CNAME` file. If it does not, type it and press Save.
5. Leave **Enforce HTTPS** unticked until the certificate is issued, then tick it. GitHub cannot issue the certificate until DNS resolves, so this is the last step, not the first.

### At GoDaddy

In **My Products &rarr; Domains &rarr; saylavy.info &rarr; DNS**, delete any existing `A` records for `@` (GoDaddy usually parks one pointing at its own holding page) and add these four:

| Type | Name | Value | TTL |
| --- | --- | --- | --- |
| A | @ | 185.199.108.153 | 1 hour |
| A | @ | 185.199.109.153 | 1 hour |
| A | @ | 185.199.110.153 | 1 hour |
| A | @ | 185.199.111.153 | 1 hour |

All four. They are GitHub Pages' anycast addresses and the redundancy is the point.

Then, so that `www.saylavy.info` works as well:

| Type | Name | Value | TTL |
| --- | --- | --- | --- |
| CNAME | www | eugenazxa.github.io | 1 hour |

Note the trailing dot GoDaddy may add; that is normal. The value is the GitHub user subdomain, **not** the repository name.

Also remove GoDaddy's parking **Forwarding** rule if one is set, under the same DNS page. A forward silently beats the A records and you will chase it for an hour.

### Checking it

DNS usually moves within 10 to 30 minutes, occasionally an hour.

```bash
nslookup saylavy.info          # expect the four 185.199.x.153 addresses
```

In the repository's **Settings &rarr; Pages**, GitHub runs its own DNS check and will say so when the domain is verified. Once it reports the certificate is issued, tick **Enforce HTTPS**.

---

## 2. The Worker, for the talking voices

Without this the flagship feature is a scripted fallback. With it, Albert and the five plaque voices answer live.

```bash
cd worker
npm install
npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY    # paste the key at the prompt
npx wrangler deploy
```

Wrangler prints a URL like `https://speak-with-albert.<subdomain>.workers.dev`.

### Lock it to the domain

In `worker/wrangler.toml`, set:

```toml
[vars]
ALLOWED_ORIGINS = "https://saylavy.info,https://www.saylavy.info"
```

Then `npx wrangler deploy` again. Without this, any website can point at your Worker and spend your tokens.

### Point the site at it

Set the same value in **both** pages. Both have voices, and it is easy to do one and forget the other:

- `index.html` &mdash; Albert
- `people.html` &mdash; the five plaque voices

```html
<script>window.ALBERT_API = "https://speak-with-albert.your-subdomain.workers.dev";</script>
```

Commit, push, and Pages redeploys in about a minute.

### Confirming it is live

Open the site and look at the badge under the chat: it reads **Offline** when no Worker is configured and switches once it can reach one. Or straight from a terminal:

```bash
curl https://speak-with-albert.your-subdomain.workers.dev/health
# {"ok":true,"model":"claude-opus-5","configured":true}
```

`configured: false` means the secret did not take. Run `wrangler secret put` again.

---

## Cost, briefly

The rate limiter in `wrangler.toml` allows 20 requests per minute per IP and is the real control. Each voice's grounding record is cached after its first use, so a conversation costs well under a cent. Six voices means six cache entries rather than one: the first question to each is full price, everything after is not.

If this is going in front of Heritage Toronto and you want a hard ceiling, set a spend limit on the Anthropic account rather than relying on the rate limiter alone.
