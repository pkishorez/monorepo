---
'@kestack/kabuki': patch
---

Start runs anywhere Nitro does: `start({ platform: nitro() })` from `@kestack/kabuki/start/platform/nitro`, beside Nitro's own `nitro()` Vite plugin, builds the server for the host Nitro's preset names, Node, Bun, Vercel or AWS Lambda among them, and Nitro serves the client's assets. Each request reaches Start with the process's env and no Cache, so a static page is kept by the CDN in front, by its Cache-Control. The Vite plugin now builds only its own two environments, the client and then the server, and leaves any other to the plugin that adds it, so Nitro builds its server once.
