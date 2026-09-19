interface RegistrationBody {
  application_type?: unknown;
  redirect_uris?: unknown;
  [key: string]: unknown;
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

const isHttpLoopback = (value: unknown): boolean => {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
};

// The provider defaults a registration to `web`, which forbids the plaintext
// loopback redirects MCP clients such as the Inspector register with.
export const normalizeClientRegistration = async (
  request: Request,
): Promise<Request> => {
  if (request.method !== 'POST') return request;
  let body: RegistrationBody;
  try {
    body = (await request.clone().json()) as RegistrationBody;
  } catch {
    return request;
  }
  if (
    body === null ||
    typeof body !== 'object' ||
    body.application_type !== undefined ||
    !Array.isArray(body.redirect_uris) ||
    body.redirect_uris.length === 0 ||
    !body.redirect_uris.every(isHttpLoopback)
  ) {
    return request;
  }

  const headers = new Headers(request.headers);
  headers.delete('content-length');
  return new Request(request, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...body, application_type: 'native' }),
  });
};
