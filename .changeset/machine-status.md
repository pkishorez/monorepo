---
'@kestack/ai-toolkit': patch
'code': patch
---

A Machine reports a Machine Status in place of `url` and `tunnel`: `Installing` while cloudflared downloads, `Opening`, `OpenFailed` with why, or `Unchecked`, `Reachable` or `Unreachable` at its address. `MachineStatus` and `addressOf` are exported from `@kestack/ai-toolkit/machines`; stored Machines read as v2, a v1 row with no address as `Opening`. cloudflared is kept in `~/.ai-toolkit/bin`, so reinstalling packages no longer loses it; a download is moved into place only once whole, fails after ten minutes and is tried again. The app's header and Settings say which step the Machine is on instead of "No address".
