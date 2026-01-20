export { MyDurableObject } from "./do"

interface Env {
  MY_DURABLE_OBJECT: DurableObjectNamespace
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // API routes
    if (url.pathname === "/api/hello") {
      return new Response("Hello from Worker!")
    }

    if (url.pathname === "/api/do") {
      const id = env.MY_DURABLE_OBJECT.idFromName("default")
      const stub = env.MY_DURABLE_OBJECT.get(id)
      return stub.fetch(request)
    }

    // Let Cloudflare serve static assets for all other routes
    return new Response("Not Found", { status: 404 })
  },
}
