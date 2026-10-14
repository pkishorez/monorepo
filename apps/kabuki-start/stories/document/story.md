# The Document

You write the HTML around your app, and what must run before the first paint runs there.

A dark-mode reader who sees a white flash on every page load notices. A cached static page cannot know their theme, so the browser must set it, before anything is painted and before React takes over.

Put the Web Platform Theme's `Script` in your `document.tsx` head, and mark `<html>` with `suppressHydrationWarning`. It reads the theme from the `kui-theme` cookie, dark when nothing is kept, and puts it on `<html>` as the `dark` class and `data-theme`. [A page opens in your theme, with no flash of the other one](kabuki-start/document/the-theme-is-set-before-the-first-paint), and [the theme you pick stays picked across reloads and pages](kabuki-start/document/the-theme-you-pick-is-kept).

The head links the site's stylesheet too, so [a page is styled before any of its scripts run](kabuki-start/document/a-page-is-styled-before-its-scripts-run), with JavaScript off as well.
