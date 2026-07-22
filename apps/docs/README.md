# docs

Documentation site for the monorepo, currently covering `std-toolkit`. It is
built with Fumadocs on TanStack Start and deployed as a fully static site to
[docs.kishore.app](https://docs.kishore.app) via Cloudflare Workers static
assets.

## Local development

```bash
pnpm --filter docs dev     # dev server
pnpm --filter docs build   # build + prerender -> apps/docs/.output/public
pnpm --filter docs lint    # fumadocs-mdx + tsc --noEmit
```

The build prerenders every route to static HTML. The deploy artifact is
`apps/docs/.output/public/` — no runtime server is used.

## Deployment

The site is a Cloudflare Worker serving static assets (`wrangler.jsonc`). Directory-style
`index.html` output means deep links like `/docs/std-toolkit/eschema` resolve directly via
`html_handling: "auto-trailing-slash"`.

```bash
pnpm --filter docs deploy   # runs: vite build && wrangler deploy
```

### First-time human setup (one-time)

These steps require interactive Cloudflare auth and cannot be automated:

1. **Authenticate wrangler** with the Cloudflare account that owns the `kishore.app` zone:

   ```bash
   cd apps/docs
   npx wrangler login
   ```

2. **First deploy** (creates the `docs` Worker and uploads the assets):

   ```bash
   pnpm --filter docs deploy
   ```

   This prints the workers.dev URL (e.g. `https://docs.<account>.workers.dev`). Verify the
   landing page and a deep link (`/docs/std-toolkit/eschema`) load there before binding the
   custom domain.

3. **Custom domain** — `docs.kishore.app` is declared in `wrangler.jsonc`
   (`routes` with `custom_domain: true`), so the deploy binds it automatically:
   Cloudflare provisions the DNS record and TLS cert since the `kishore.app`
   zone already exists in the account. No dashboard steps needed.

4. **Verify** in a browser once DNS/TLS propagates (usually under a minute):
   - `https://docs.kishore.app/` — landing page
   - `https://docs.kishore.app/docs/std-toolkit` — std-toolkit overview
   - `https://docs.kishore.app/docs/std-toolkit/eschema` — deep link resolves directly

### Subsequent deploys

```bash
pnpm --filter docs deploy
```

No CI/CD is configured this round; deploys are manual.
