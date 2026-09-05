import handler, { createServerEntry } from '@tanstack/react-start/server-entry';
import { handleRpc } from './server/entry.ts';

export default createServerEntry({
  fetch: (request, options) =>
    new URL(request.url).pathname === '/rpc'
      ? handleRpc(request)
      : handler.fetch(request, options),
});
