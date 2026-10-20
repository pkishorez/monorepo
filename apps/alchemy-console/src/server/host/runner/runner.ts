import { verify } from '../../run-token/index.ts';

/*
 * `/runner`: a run's container calling back. Only a WebSocket upgrade
 * carrying a valid run token (`?token=`, as a WebSocket can send no header
 * of its own) is handed on, to `open`, with the user and the run the token
 * names; the token itself goes no further. Anything else is answered here,
 * before any upgrade.
 */

const refusal = (status: number, text: string) =>
  new Response(text, { status, headers: { 'content-type': 'text/plain' } });

export const runner = async (
  request: Request,
  vaultKey: string | undefined,
  open: (
    claim: { readonly userId: string; readonly runId: string },
    request: Request,
  ) => Promise<Response>,
): Promise<Response> => {
  if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket')
    return refusal(426, 'Upgrade to a WebSocket');
  const token = new URL(request.url).searchParams.get('token');
  if (!vaultKey || !token) return refusal(401, 'A run token is required');
  const claim = await verify(vaultKey, token, Date.now()).catch(() => null);
  if (claim === null) return refusal(401, 'That run token is not valid');
  return open(claim, request);
};
