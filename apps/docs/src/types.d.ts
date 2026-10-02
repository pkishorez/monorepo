export {};

declare global {
  namespace Cloudflare {
    // Written out instead of `Cloudflare.InferEnv<typeof Website>`: alchemy
    // 2.0.0-beta.80 infers this binding as `Service<Entrypoint>`, which is too
    // deep for TypeScript. The site only proxies HTTP to the signaling Worker,
    // so a plain `Fetcher` is all it needs. Keep in step with
    // `src/infra/website.ts`.
    interface Env {
      DURABLE_WEBRTC_SIGNALING: Fetcher;
    }
  }
}

declare module '@tanstack/react-start' {
  interface Register {
    server: {
      requestContext: { env: Cloudflare.Env };
    };
  }
}
