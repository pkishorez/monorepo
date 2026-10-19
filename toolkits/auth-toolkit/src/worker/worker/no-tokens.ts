// ADR 0019: page JavaScript never holds a Sign-in token. better-auth hands
// one back in several places (`session.token` in get-session, list-sessions
// and list-device-sessions, `token` after a sign-in, the bearer plugin's
// `set-auth-token` header), so every response leaving the worker loses them.
// The exceptions issue a credential on purpose to a program that is not a
// page: a Device's token after Device Login, the OAuth Client's tokens, and
// the hosted dashboard's own API.

const ISSUES_CREDENTIALS = (path: string) =>
  path === '/device/token' ||
  path.startsWith('/oauth2/') ||
  path.startsWith('/dash/');

const SET_AUTH_TOKEN = 'set-auth-token';

const withoutTokenKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(withoutTokenKeys);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'token')
      .map(([key, entry]) => [key, withoutTokenKeys(entry)]),
  );
};

const isJson = (response: Response) =>
  response.headers.get('content-type')?.includes('json') === true;

/** `apiPath` is the path below `/api/auth`. */
export const withoutSessionTokens = async (
  response: Response,
  apiPath: string,
): Promise<Response> => {
  const headers = new Headers(response.headers);
  headers.delete(SET_AUTH_TOKEN);
  const exposed = headers
    .get('access-control-expose-headers')
    ?.split(',')
    .map((name) => name.trim())
    .filter((name) => name && name.toLowerCase() !== SET_AUTH_TOKEN);
  if (exposed?.length) {
    headers.set('access-control-expose-headers', exposed.join(', '));
  } else {
    headers.delete('access-control-expose-headers');
  }

  let body: BodyInit | null = response.body;
  if (!ISSUES_CREDENTIALS(apiPath) && isJson(response) && response.body) {
    const text = await response.text();
    try {
      body = JSON.stringify(withoutTokenKeys(JSON.parse(text)));
      headers.delete('content-length');
    } catch {
      body = text;
    }
  }
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};
