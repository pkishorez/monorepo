import type { Visit, Visited } from './visitor/index.ts';

type Admitted = Extract<Visit, { readonly _tag: 'Admitted' }>;

/*
 * `/rpc`: the browser's socket to its User Space. Only a WebSocket upgrade
 * from an invited member is handed on, to `open`; anyone else is answered
 * here, before any upgrade, with a status the browser can read. Either way
 * the response carries the Sign-in cookies the Auth Worker refreshed.
 */

const refusal = (status: number, text: string) =>
  Promise.resolve(
    new Response(text, { status, headers: { 'content-type': 'text/plain' } }),
  );

/** `response`, setting `cookies` too; a 101 keeps its socket. */
const carrying = (response: Response, cookies: ReadonlyArray<string>) => {
  if (cookies.length === 0) return response;
  const headers = new Headers(response.headers);
  for (const cookie of cookies) headers.append('set-cookie', cookie);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
    ...(response.webSocket ? { webSocket: response.webSocket } : {}),
  } as ResponseInit);
};

const isUpgrade = (request: Request) =>
  request.headers.get('upgrade')?.toLowerCase() === 'websocket';

export const rpc = async (
  request: Request,
  visit: (request: Request) => Promise<Visited>,
  open: (visitor: Admitted) => Promise<Response>,
): Promise<Response> => {
  if (!isUpgrade(request)) return refusal(426, 'Upgrade to a WebSocket');
  const { visit: visitor, cookies } = await visit(request);
  const answer = await (() => {
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
  })();
  return carrying(answer, cookies);
};
