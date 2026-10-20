---
'@kestack/web-theme': patch
---

The first release: the one look every kstack web app and the Auth Worker's pages share. `theme.css` holds the colour tokens in shadcn's names for Tailwind v4, in a cool palette with a page colour behind white surfaces, and `font-inter.css` holds Inter. `createTheme`, `FontPreload`, `themeFromCookies`, `THEME_COOKIE` and `THEME_SCRIPT` keep light or dark in the `kui-theme` cookie on the Shared Cookie Domain, and follow the system's setting until a choice is saved.
