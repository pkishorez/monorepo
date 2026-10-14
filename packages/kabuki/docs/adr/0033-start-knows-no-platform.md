# Start knows no platform: an adapter fills a port

Start's server is a `Handler`: a `fetch` that takes each request with a `Host`, the platform's env and, if it has one, a `PageCache` for static pages. It knows no platform. Each platform's adapter lives in a folder of its own under `src/start/platform`, which declares the port, and is imported from its own subpath, `@kestack/kabuki/start/platform/cloudflare`, so a build carries only the adapter it names. An adapter is a `Platform` the Vite plugin reads, the conditions the server build resolves with and the function its entry wraps the handler in, and that function, `serve(handler)`, which the platform runs. The plugin writes the handler and the server's entry apart, so `vite dev` runs the handler in Node with an empty env and no Cache whatever the platform.

## Considered Options

- **Cloudflare written into Start, as it was**: rejected. `caches.default`, the workerd conditions and the Worker's `fetch(request, env)` were the only Cloudflare parts; behind a port, the rest serves any platform that speaks `Request` and `Response`.
- **Every adapter in one module, chosen by name**: rejected. Importing one would bundle the others.
- **The port in a sibling folder, so no adapter imports its parent**: rejected. The platform is the port; its adapters are its children, and each imports only the types it fills, which `laymos.config.json` allows as an Exception with that Reason.

## Consequences

- `start({ platform })` takes the adapter: there is no default.
- Cloudflare is the only adapter. A second, for Node, Vercel or Lambda, proves the port; until then it is shaped by one.
