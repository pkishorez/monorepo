import type { Visit } from './visitor/index.ts';

type Admitted = Extract<Visit, { readonly _tag: 'Admitted' }>;

/*
 * `/rpc`: the browser's socket to its User Space. Only a WebSocket upgrade
 * from an invited member is handed on, to `open`; anyone else is answered
 * here, before any upgrade, with a status the browser can read.
 */

const refusal = (status: number, text: string) =>
  Promise.resolve(
    new Response(text, { status, headers: { 'content-type': 'text/plain' } }),
  );

const isUpgrade = (request: Request) =>
  request.headers.get('upgrade')?.toLowerCase() === 'websocket';

export const rpc = async (
  request: Request,
  visit: (request: Request) => Promise<Visit>,
  open: (visitor: Admitted) => Promise<Response>,
): Promise<Response> => {
  if (!isUpgrade(request)) return refusal(426, 'Upgrade to a WebSocket');
  const visitor = await visit(request);
  switch (visitor._tag) {
    case 'SignedOut':
      return refusal(401, 'Sign in first');
    case 'Unreachable':
      return refusal(503, 'The sign-in service did not respond');
    case 'NotInvited':
      return refusal(403, 'Console is invite-only for now');
    case 'Admitted':
      return open(visitor);
  }
};
