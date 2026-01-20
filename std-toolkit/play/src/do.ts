import { DurableObject } from "cloudflare:workers"

export class MyDurableObject extends DurableObject {
  async fetch(_request: Request): Promise<Response> {
    return new Response("Hello DO")
  }
}
