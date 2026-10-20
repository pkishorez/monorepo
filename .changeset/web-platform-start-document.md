---
'@kestack/web-platform': patch
---

`@kestack/web-platform/start` gives a Kabuki Start app its Document: Start's head and scripts, Inter preloaded, the Theme's script and the device marked before the first paint. Text no longer moves when Inter arrives: `FontPreload` (from `./theme`) asks for the same Latin file `font-inter.css` declares before the first paint, and `font-inter.css` now declares `Inter Fallback`, Arial sized to Inter's metrics, which the Theme's sans family names next.
