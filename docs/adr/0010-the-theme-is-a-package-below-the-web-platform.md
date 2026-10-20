# The Theme is a package below the Web Platform

Status: accepted.

Every kstack web app and the Auth Worker's pages share one look and one Theme: the same colour tokens, Inter, and light or dark saved in one cookie. That Theme lives in its own package, `@kestack/web-theme` (`packages/web-theme`), below both the Web Platform and auth-toolkit.

- **What moved.** The Web Platform's `theme` layer, whole: the tokens (`theme.css`), the fonts (`font-inter.css`), `createTheme`, `FontPreload`, the head script and the cookie. `@kestack/web-platform/theme` and its `theme.css` and `font-inter.css` stay as doors that re-export it, so apps change nothing to keep working.
- **Who depends on it.** The Web Platform, as a dependency. auth-toolkit, as a devDependency: the Auth Worker's pages are a Kabuki Start app built into auth-toolkit's `dist`, so the Theme is bundled into them at build time. Its tsc-built doors never import it, so it is not a runtime dependency of auth-toolkit.
- **The graph.** web-theme ← auth-toolkit ← web-platform, and web-theme ← web-platform. There is no cycle, so `vp run -r build`, the pre-commit hook and CI build web-theme first and need no special order.
- **The CSS ships from source.** `theme.css` and `font-inter.css` are exported from `src/css`, so reading them needs no build. Only the TypeScript is built.
- **Components stay in the Web Platform.** The Auth Worker's pages keep their own `ui/*`, written in the Web Platform's token names. A shared component would have to live in web-theme or be read from the Web Platform; the first makes web-theme a component library, the second is the cycle.

## Considered Options

- **The pages read the Web Platform's theme from source**: rejected. auth-toolkit would have to depend on the Web Platform, which depends on auth-toolkit: a cycle in the workspace graph that `vp run -r` and pnpm's ordering cannot sort. Reaching it by a relative path instead hides the dependency, so neither the package graph nor the task cache knows a change to the tokens rebuilds the pages.
- **The tokens in auth-toolkit, which the Web Platform already depends on**: rejected. A sign-in service is the wrong home for every app's look, and it would put the Theme on auth-toolkit's careful release cadence ([ADR 0006](0006-platforms-may-break-toolkits-keep-what-persists.md)).
- **Only the CSS moves; the Theme's script and cookie stay in the Web Platform**: rejected. The pages would need their own copy of the head script and the cookie code, and two copies of the mechanism is what this decision removes.
- **The pages use the Web Platform's components too**: rejected for now. It needs the components below auth-toolkit as well, a far larger move than the Theme.

## Consequences

- web-theme depends on nothing in the repo, so, like kabuki and use-keys, it keeps its own version ([ADR 0009](0009-two-version-groups-the-stack-and-devtools.md)). A release of it patches the Web Platform and auth-toolkit.
- It is a new public package: npm must accept its first publish from CI before the release workflow can ship it.
- The Auth Worker embeds Inter and JetBrains Mono in its bundle, about 400 KB more.
