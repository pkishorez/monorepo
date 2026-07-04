# Issues: fumadocs-site

Source: `this conversation`
Repo root: `/Users/kishorepolamarasetty/CAREER/MINE/monorepo`
Project commands: `pnpm test` · `pnpm lint` (`vp check && pnpm -r lint`) · `pnpm dev`

## North Star

Build a single documentation site for all public packages in this monorepo — `std-toolkit`, `use-effect-ts`, `depcruise-viz`, `@kishorez/devtools` — using Fumadocs on TanStack Start, deployed as a fully static site to `docs.kishore.app` via Cloudflare/Wrangler. The docs shell (sidebar, TOC, search, layouts) comes from `fumadocs-ui`; everything else reuses `@monorepo/frontend`, with one theme source of truth: the frontend package's CSS tokens drive fumadocs' `--fd-*` variables. This round delivers only minimal bird's-eye documentation per package (one overview page per section, distilled from existing READMEs); depth comes in a later round. The constraint we would slip scope before violating: stay Vite-native (no Next.js) and keep the frontend theme the single styling source of truth. Good looks like: `pnpm --filter docs build` produces a prerendered static site where every package tab renders its overview in the monorepo's own visual theme.

## Glossary

- **Root tab** — a top-level content folder marked `"root": true` in its `meta.json`; fumadocs renders it as a sidebar tab, and switching tabs swaps the entire sidebar tree.
- **fd-token mapping** — a CSS file assigning fumadocs variables from frontend tokens, e.g. `--fd-background: var(--background)`.
- **Bird's-eye page** — a single `index.mdx` overview per package/subsection: what it is, install, core concepts, links. No API depth.

## Conventions

- Files kebab-case only; comments only when necessary (see `CLAUDE.md`).
- `repos/effect-smol` is read-only reference — never edit or import from it.
- Workspace packages are consumed as raw TS source via `exports` maps (see `packages/frontend/package.json`) — the docs app must be able to compile `.tsx` from `@monorepo/frontend/src`.
- Tailwind v4 CSS-first config (`@theme`, `@import`), no `tailwind.config.js`.
- Use `pnpm` for everything; new app must join the workspace via `pnpm-workspace.yaml`.

---

## Task: Scaffold apps/docs — TanStack Start + Fumadocs, static prerender [AFK]

**Why.** Everything else (theme, content, landing, deploy) needs a running Vite-native docs app. This slice proves the fumadocs + TanStack Start + static-prerender pipeline end-to-end before any content investment.

**What.** A new workspace app at `apps/docs` running Fumadocs (`fumadocs-core`, `fumadocs-mdx`, `fumadocs-ui`) on TanStack Start. `pnpm-workspace.yaml` gains `apps/*`. One placeholder page at `content/docs/index.mdx` renders inside fumadocs' `DocsLayout` with working sidebar and TOC. Build produces fully prerendered static HTML (TanStack Start prerender — no runtime server) plus the default client-side Orama search. Follow the official Fumadocs TanStack Start guide (https://fumadocs.dev/docs/ui/tanstack-start) — do not hand-roll the loader/source plumbing; use `fumadocs-mdx` collections and its generated source.

**Read first.**

- `pnpm-workspace.yaml` — currently globs `packages/*` and `std-toolkit`; add `apps/*`.
- `package.json` (root) — scripts run via `vp run -r`; give the new app matching `dev`/`build`/`lint` scripts.
- `packages/frontend/package.json` — dependency versions to align with (React 19, Vite 8, Tailwind 4, TS 6) and the source-export style the docs app must consume later.
- `packages/frontend/vite.config.ts` — the workspace's Vite conventions.
- `packages/devtools/package.json` — example of a non-frontend workspace package's script layout.

**Interface produced.**

- `apps/docs/` app with scripts: `pnpm --filter docs dev` (dev server), `pnpm --filter docs build` (static prerendered output), `pnpm --filter docs lint` (`tsc --noEmit`).
- `apps/docs/content/docs/` — the content root that task "Content skeleton" fills; collection defined in `apps/docs/source.config.ts`.
- `apps/docs/src/routes/docs/$.tsx` (catch-all docs route) and `apps/docs/src/styles/app.css` — the CSS entry that task "Theme unification" rewrites. Keep fumadocs' default `fumadocs-ui/css/*` imports for now.
- Package name in `apps/docs/package.json`: `docs`, `"private": true`.

**Inputs from predecessors.** None — can start immediately.

**Out of scope.**

- No theme customization (default fumadocs styles are fine here) — owned by "Theme unification".
- No real content beyond one placeholder `index.mdx` — owned by "Content skeleton".
- No landing-page work at `/` beyond whatever the scaffold defaults to.
- No wrangler/deploy config — owned by "Cloudflare deploy".
- Do not modify any existing package.

**Acceptance criteria.**

- [ ] `pnpm install` succeeds with `apps/*` in the workspace.
- [ ] `pnpm --filter docs dev` serves the placeholder page in `DocsLayout` with sidebar + TOC.
- [ ] `pnpm --filter docs build` completes and emits prerendered static HTML (verify the docs page exists as an `.html` file in the build output).
- [ ] Built-in Orama search UI opens and indexes the placeholder page.
- [ ] `pnpm --filter docs lint` passes.

**Done when.** `pnpm --filter docs build` succeeds and the build output contains a prerendered HTML file for the placeholder docs page.

---

## Task: Theme unification — frontend tokens drive fumadocs [AFK]

**Why.** One theme source of truth was a settled design decision: the docs site must render in the monorepo's own palette and fonts so `@monorepo/frontend` components drop into MDX and the landing page without looking off-palette.

**What.** Rewrite `apps/docs/src/styles/app.css` to: import Tailwind v4, import `@monorepo/frontend`'s theme/global styles (`packages/frontend/src/styles/theme.css` defines `@theme inline` mappings over shadcn-shaped tokens like `--background`, `--primary`; `global.css` holds the token values; `font-inter.css` wires Inter), import fumadocs-ui's style layer, and add an fd-token mapping block assigning every fumadocs color variable from the frontend tokens (`--fd-background: var(--background)`, `--fd-primary: var(--primary)`, `--fd-muted: var(--muted)`, `--fd-border: var(--border)`, etc. — cover the full `--fd-*` color set fumadocs documents, both light and dark). Fonts: Inter variable for body, JetBrains Mono for code, via the existing `@fontsource-variable` packages (add them as deps of `apps/docs`). Ensure fumadocs' Tailwind preset/source scanning includes `@monorepo/frontend` source paths so frontend components used in MDX get their utility classes generated. Dark mode must work with fumadocs' theme toggle (it toggles a `dark` class — confirm frontend tokens switch on the same mechanism in `global.css` and align if not).

**Read first.**

- `packages/frontend/src/styles/theme.css` — the `@theme inline` token bridge (shadcn-shaped names).
- `packages/frontend/src/styles/global.css` — actual token values and dark-mode mechanism.
- `packages/frontend/src/styles/font-inter.css` and `typography.css` — font and prose setup to reuse.
- `apps/docs/src/styles/app.css` — the scaffold's CSS entry to rewrite.
- fumadocs theme docs (https://fumadocs.dev/docs/ui/theme) — authoritative `--fd-*` variable list.

**Interface produced.**

- `apps/docs/src/styles/app.css` — single CSS entry; successors (landing page) rely on frontend components rendering correctly anywhere in the app.
- `@monorepo/frontend` added to `apps/docs/package.json` dependencies (`workspace:*`) with React 19 peer satisfied.

**Inputs from predecessors.** Task "Scaffold apps/docs" produces `apps/docs` with `src/styles/app.css` and a building app.

**Out of scope.**

- Do not edit anything in `packages/frontend` (unless the dark-mode class mechanism genuinely conflicts — then the change is the minimal selector alignment, nothing else).
- No content or landing-page work; no vendoring of fumadocs components via shadcn registry.

**Acceptance criteria.**

- [ ] Docs pages render with frontend tokens: background, primary, borders, and Inter/JetBrains Mono fonts visibly match the frontend theme (compare against a cosmos fixture from `packages/frontend`).
- [ ] Light/dark toggle in the fumadocs layout switches both fumadocs chrome and a test `@monorepo/frontend/components/ui/button` rendered in the placeholder MDX page.
- [ ] `pnpm --filter docs build` and `pnpm --filter docs lint` still pass.

**Done when.** The placeholder docs page renders a frontend `Button` in-theme in both light and dark, and `pnpm --filter docs build` succeeds.

---

## Task: Content skeleton + bird's-eye docs for all packages [AFK]

**Why.** The site's reason to exist: each public package gets a navigable home with at least a bird's-eye overview now, so the next round only adds depth, not structure.

**What.** Under `apps/docs/content/docs/`, create one root tab per package and a minimal overview page per section, distilled from the existing READMEs (rewrite for a docs audience; do not paste READMEs verbatim, but keep their terminology):

```
content/docs/
  std-toolkit/
    meta.json        ← "root": true, title "std-toolkit"
    index.mdx        ← pitch + subpath table (source: std-toolkit/README.md)
    eschema/{meta.json,index.mdx}        ← source: std-toolkit/src/eschema/README.md
    core/{meta.json,index.mdx}           ← source: std-toolkit/src/core/README.md
    tanstack-sync/{meta.json,index.mdx}  ← source: std-toolkit/src/tanstack-sync/README.md
    dynamodb/{meta.json,index.mdx}       ← source: std-toolkit/src/db/dynamodb/README.md
    sqlite/{meta.json,index.mdx}         ← source: std-toolkit/src/db/sqlite/README.md
  use-effect-ts/
    meta.json ("root": true), index.mdx  ← source: packages/use-effect-ts/README.md
  depcruise-viz/
    meta.json ("root": true), index.mdx  ← source: packages/depcruise-viz/README.md
  devtools/
    meta.json ("root": true), index.mdx  ← source: packages/devtools/README.md
```

Each bird's-eye `index.mdx`: frontmatter (`title`, `description`), what the package/subsection is (2–4 sentences), install snippet, 2–3 core concepts as short sections, and links to sibling sections. Ordering via each `meta.json` `pages` array: std-toolkit subsections ordered `eschema, core, tanstack-sync, dynamodb, sqlite`. Delete or repurpose the scaffold's placeholder `index.mdx` (a top-level `content/docs/index.mdx` may remain as a brief "pick a package" page). **devtools constraint:** describe it as a local devtools UI combining a viewer for `lotel` telemetry with `depcruise-viz` graph visualization; `lotel` itself is intentionally NOT documented and must not get a tab or page.

**Read first.**

- `std-toolkit/README.md` — package pitch and subpath table.
- `std-toolkit/src/eschema/README.md`, `std-toolkit/src/core/README.md`, `std-toolkit/src/tanstack-sync/README.md`, `std-toolkit/src/db/dynamodb/README.md`, `std-toolkit/src/db/sqlite/README.md` — per-subsection source material.
- `packages/use-effect-ts/README.md`, `packages/depcruise-viz/README.md`, `packages/devtools/README.md` — per-package source material.
- `apps/docs/source.config.ts` — the collection the content must satisfy.
- fumadocs page-organization docs (https://fumadocs.dev/docs/ui/page-conventions) — `meta.json` `root`/`pages` semantics.

**Interface produced.**

- Stable doc URLs successors link to: `/docs/std-toolkit`, `/docs/std-toolkit/eschema`, `/docs/std-toolkit/core`, `/docs/std-toolkit/tanstack-sync`, `/docs/std-toolkit/dynamodb`, `/docs/std-toolkit/sqlite`, `/docs/use-effect-ts`, `/docs/depcruise-viz`, `/docs/devtools`.

**Inputs from predecessors.** Task "Scaffold apps/docs" produces `apps/docs/content/docs/` wired to a fumadocs-mdx collection in `apps/docs/source.config.ts`.

**Out of scope.**

- Only bird's-eye depth — no API reference, no `AutoTypeTable`, no Twoslash, no exhaustive guides (explicitly deferred to a later round).
- No `lotel` tab or page.
- No styling changes (`src/styles/` is owned by "Theme unification", running in parallel — do not touch it).
- Do not edit any package README.

**Acceptance criteria.**

- [ ] All four root tabs appear in the sidebar tab switcher; selecting std-toolkit shows its five subsections in the stated order.
- [ ] Every URL listed under "Interface produced" renders a non-empty overview with title, description, install snippet, and core concepts.
- [ ] devtools page states it combines lotel-telemetry UI + depcruise-viz visualization, without documenting lotel.
- [ ] `pnpm --filter docs build` prerenders all pages; Orama search finds "eschema".

**Done when.** `pnpm --filter docs build` succeeds with prerendered HTML for all nine URLs above.

---

## Task: Landing page — HomeLayout hero + package cards [AFK]

**Why.** `docs.kishore.app/` needs a face: a one-screen home that pitches std-toolkit and presents the ecosystem, and doubles as the first real showcase of `@monorepo/frontend` outside cosmos.

**What.** Replace the scaffold's root route (`apps/docs/src/routes/index.tsx`) with a one-screen landing page wrapped in fumadocs' `HomeLayout` (shared nav + theme toggle). Content: a hero headlining std-toolkit — "Single-table design toolkit — database-agnostic sync over single-table item collections" (the pitch from `std-toolkit/README.md`; the marketing aha is that sync only needs sorted items and works over any database) with a CTA linking to `/docs/std-toolkit`; below it, one card per package (std-toolkit, use-effect-ts, depcruise-viz, devtools) with a one-line description and link to its tab. Build the hero and cards from `@monorepo/frontend` components (`@monorepo/frontend/components/ui/card`, `.../ui/button`, icons via `@monorepo/frontend/lucide`) — not fumadocs components — inside `HomeLayout`. Keep it to one screen; no feature grids, testimonials, or extra sections.

**Read first.**

- `apps/docs/src/routes/index.tsx` — the route to replace.
- `packages/frontend/src/components/ui/card.tsx` and `button.tsx` — component APIs to compose.
- `packages/frontend/src/lib/lucide.ts` — icon re-export convention (import icons from `@monorepo/frontend/lucide`).
- `std-toolkit/README.md` — pitch wording for the hero.
- fumadocs HomeLayout docs (https://fumadocs.dev/docs/ui/layouts/home-layout).

**Interface produced.**

- `/` route rendering the landing page. Internal-only; nothing downstream consumes it programmatically.

**Inputs from predecessors.**

- Task "Theme unification" produces `apps/docs/src/styles/app.css` with frontend tokens live, and `@monorepo/frontend` as a dependency of `apps/docs`.
- Task "Content skeleton" produces the doc URLs the cards link to (`/docs/std-toolkit`, `/docs/use-effect-ts`, `/docs/depcruise-viz`, `/docs/devtools`).

**Out of scope.**

- No changes to `content/docs/`, styles files, or `packages/frontend`.
- No custom nav beyond what `HomeLayout` provides.

**Acceptance criteria.**

- [ ] `/` renders hero + four package cards in both light and dark, using frontend Card/Button components.
- [ ] Each card links to its package's docs URL; hero CTA links to `/docs/std-toolkit`.
- [ ] Page prerenders statically; `pnpm --filter docs build` and `pnpm --filter docs lint` pass.

**Done when.** `pnpm --filter docs build` emits a prerendered `/` page whose hero and four cards link to the live doc routes.

---

## Task: Cloudflare deploy via Wrangler → docs.kishore.app [HITL]

**Why.** The North Star's observable end state: the site publicly served at `docs.kishore.app`, static, zero-runtime.

**What.** Add Wrangler config to `apps/docs` deploying the static prerendered build output as a Cloudflare Workers static-assets site (or Cloudflare Pages if the TanStack Start output maps more cleanly — prefer Workers static assets, Cloudflare's current recommended path): `apps/docs/wrangler.jsonc` with `name: "docs"`, `assets` pointing at the prerender output directory (locate it from the task-1 build — TanStack Start's client dist), plus a `deploy` script in `apps/docs/package.json` (`wrangler deploy` after build). Add `wrangler` as a devDependency of `apps/docs`. Then (human steps): `wrangler login` under the user's Cloudflare account, first deploy, and bind the custom domain `docs.kishore.app` to the worker (the `kishore.app` zone already exists in the user's Cloudflare account). Document the exact human steps in `apps/docs/README.md`.

**Read first.**

- `apps/docs/package.json` and the build output directory produced by `pnpm --filter docs build` — determines the `assets` path.
- Cloudflare docs: Workers static assets (https://developers.cloudflare.com/workers/static-assets/) and custom domains.
- TanStack Start hosting/prerender docs for the Cloudflare target.

**Interface produced.**

- `apps/docs/wrangler.jsonc` and `pnpm --filter docs deploy` — the deploy entry point.
- `apps/docs/README.md` — human runbook: login, deploy, custom-domain binding.

**Inputs from predecessors.** Task "Scaffold apps/docs" produces the static build (`pnpm --filter docs build`); run this task after "Landing page" so the first public deploy is the complete site.

**Out of scope.**

- No CI/CD pipeline (manual deploy is fine this round).
- No changes to app code or content; no non-static server features.

**Acceptance criteria.**

- [ ] `pnpm --filter docs deploy` (after human `wrangler login`) uploads the static build without errors.
- [ ] `https://docs.kishore.app/` serves the landing page; `/docs/std-toolkit/eschema` serves its prerendered page directly (deep-link works).
- [ ] `apps/docs/README.md` documents the human steps actually performed.

**Done when.** `https://docs.kishore.app/docs/std-toolkit` returns the prerendered std-toolkit overview in a browser.
