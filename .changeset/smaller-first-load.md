---
'@kestack/web-platform': patch
'code': patch
---

Breaking: `@kestack/web-platform/ui/components/lucide` and `/motion` are gone. Import from `lucide-react` and `motion/react`.

code's first load is about 570 KB gzipped, down from about 1 MB. Pages load on their own, and `pnpm size` fails past the budget.
