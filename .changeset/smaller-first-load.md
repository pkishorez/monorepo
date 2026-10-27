---
'@kestack/web-platform': patch
'code': patch
---

Breaking: `@kestack/web-platform/ui/components/lucide` and `@kestack/web-platform/ui/components/motion` are gone. They re-exported all of `lucide-react` and `motion/react` as one namespace, which no bundler can shake, so every icon shipped. Import icons from `lucide-react` and motion from `motion/react` instead.

code's first load is a fifth of what it was: about 570 KB gzipped instead of about 1 MB. Only the icons it draws ship, and Settings, the project and session pages, the Draft with its editor, and the Kabuki page load on their own: the page the address names as the app starts, and the rest once the browser is idle, so none draws empty first. The Kabuki Devtools and their Dock are never in the first load. `pnpm size` fails when the first load grows past its budget, and CI runs it.
