// src/server.ts
import handler, { createServerEntry } from '@tanstack/react-start/server-entry';
import { env } from 'cloudflare:workers';

export { HelloWorldDO } from './durable-objects/hello-world';

export default createServerEntry({
  async fetch(request) {
    const url = new URL(request.url);
    console.log('URL: ', url.pathname);

    if (url.pathname === '/api') {
      const stub = env.HELLO_WORLD_DO.getByName('default');
      const message = await stub.sayHello();
      return new Response(message);
    }

    return handler.fetch(request);
  },
});
