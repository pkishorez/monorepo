---
'@kestack/kabuki': patch
'@kestack/web-platform': patch
'@kestack/auth-toolkit': patch
---

The Kabuki devtools move into kabuki as `@kestack/kabuki/devtools`: `KabukiDevtools`, `Inspector`, and the new `FloatingDevtools`, a corner button that opens them over the page. Each draws into a shadow root with its own stylesheet, so it needs no Tailwind from the page and looks the same on any theme; `motion` is an optional peer. web-platform's `recipes/kabuki-devtools` now re-exports them. The Auth Worker's pages show `FloatingDevtools` when its `url` is `localhost` or under `.localhost`, loaded as a chunk of its own.
