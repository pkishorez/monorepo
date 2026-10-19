// Who may call which endpoint (ADR 0018). Every origin under the Shared
// Cookie Domain is trusted for the Accounts endpoints a First-Party app
// uses, but only the Auth Worker's own pages may answer as an Approving
// Account or change what the Home Page manages: a sibling page's script
// could otherwise approve a Device Login it started for an Account of this
// browser. A Device's own calls come from a program, never a browser, so a
// browser's call there is refused: page code never gets a token from them.

/** POSTs only the Auth Worker's own pages make. Paths below `/api/auth`. */
const PAGES_ONLY = new Set([
  '/sign-ins/revoke',
  '/sign-ins/revoke-others',
  '/grants/revoke',
  '/device/answer',
  '/consent/answer',
  // better-auth's own answers, which the pages reach through the two above.
  '/device/approve',
  '/device/deny',
  '/oauth2/consent',
]);

/** Device Login's program-side endpoints. */
const DEVICES_ONLY = new Set(['/device/code', '/device/token']);

/** A browser names where a request comes from; a program does not. */
const fromBrowser = (request: Request) =>
  request.headers.has('origin') || request.headers.has('sec-fetch-site');

const refused = (message: string) =>
  new Response(JSON.stringify({ error: 'forbidden', message }), {
    status: 403,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });

/** A 403 for a caller `apiPath` does not serve, or undefined. `origin` is
 * the Auth Worker's own. */
export const refuseCaller = (
  request: Request,
  apiPath: string,
  origin: string,
): Response | undefined => {
  if (DEVICES_ONLY.has(apiPath) && fromBrowser(request)) {
    return refused('Device Login is for programs, not pages.');
  }
  if (
    request.method === 'POST' &&
    PAGES_ONLY.has(apiPath) &&
    fromBrowser(request) &&
    request.headers.get('origin') !== origin
  ) {
    return refused('Only the Auth Worker’s own pages may do that.');
  }
  return undefined;
};
