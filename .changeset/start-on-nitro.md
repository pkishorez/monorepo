---
'@kestack/kabuki': patch
---

Start runs anywhere Nitro does: `start({ platform: nitro({ preset: 'vercel' }) })` from `@kestack/kabuki/start/platform/nitro`, beside Nitro's own plain `nitro()` Vite plugin, builds the server for the preset it names, Cloudflare, Vercel, Node, Bun or AWS Lambda among them, and Nitro serves the client's assets. The preset reaches Nitro through the Vite config, which a platform may now add to. Each request reaches Start with the Worker's env and the Cloudflare Cache on Cloudflare, and the process's env elsewhere, where a static page is kept by the CDN in front, by its Cache-Control. The Vite plugin now builds only its own two environments, the client and then the server, and leaves any other to the plugin that adds it, so Nitro builds its server once.
