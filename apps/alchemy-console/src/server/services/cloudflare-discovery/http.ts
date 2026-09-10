import { Data, Effect, Schema } from 'effect';
import {
  HttpClient,
  HttpClientRequest,
  type HttpClientError,
} from 'effect/unstable/http';

export class CloudflareDiscoveryError extends Data.TaggedError(
  'CloudflareDiscoveryError',
)<{
  readonly code:
    | 'cloudflare-permission'
    | 'state-store-missing'
    | 'discovery-failed';
  readonly reason: string;
}> {}

export const failure = (
  reason: string,
  code: CloudflareDiscoveryError['code'] = 'discovery-failed',
) => new CloudflareDiscoveryError({ code, reason });

// Keep failure context without adding a log or span for every request.
export const describeFailure = <A, R>(
  name: string,
  operation: Effect.Effect<A, CloudflareDiscoveryError, R>,
) =>
  operation.pipe(
    Effect.mapError((error) =>
      failure(`${name} failed: ${error.reason}`, error.code),
    ),
  );

export const nonEmpty = Schema.String.check(
  Schema.makeFilter((value) => value.trim().length > 0),
);
export const apiResult = <A>(schema: Schema.Codec<A>) =>
  Schema.Struct({ success: Schema.Literal(true), result: schema });

const isCloudflareApi = (request: HttpClientRequest.HttpClientRequest) =>
  new URL(request.url).hostname === 'api.cloudflare.com';

const rejectedResponse = (status: number, detail: string) => {
  const prefix = `Cloudflare returned HTTP ${status}.`;
  switch (status) {
    case 401:
      return failure(
        `${prefix} ${detail || 'The token was rejected. Check that it is valid and has not expired.'}`,
        'cloudflare-permission',
      );
    case 403:
      return failure(
        `${prefix} ${detail || 'Access was denied. Check token permissions and account access.'}`,
        'cloudflare-permission',
      );
    case 404:
      return failure(
        `${prefix} ${detail || 'The requested state Worker or configuration was not found in this account.'}`,
        'state-store-missing',
      );
    case 429:
      return failure(
        `${prefix} ${detail || 'Cloudflare rate limited the request. Please retry shortly.'}`,
      );
    default:
      return failure(
        `${prefix} ${detail || 'Please retry or check the Cloudflare configuration.'}`,
      );
  }
};

export const send = Effect.fn(function* (
  request: HttpClientRequest.HttpClientRequest,
  secrets: ReadonlySet<string>,
) {
  const http = yield* HttpClient.HttpClient;
  const response = yield* http.execute(request).pipe(
    // Default HTTP spans expose preview-token URLs and headers; the discovery span owns this work.
    Effect.provideService(HttpClient.TracerDisabledWhen, () => true),
    Effect.mapError((error) => failure(requestFailure(error, secrets))),
  );
  if (response.status >= 200 && response.status < 300) return response;

  if (response.status >= 300 && response.status < 400)
    return yield* Effect.fail(
      failure(
        `Cloudflare returned HTTP ${response.status}. Redirects are not followed when sending credentials. Check the state-store endpoint.`,
      ),
    );

  const detail = isCloudflareApi(request)
    ? cloudflareMessage(
        yield* response.json.pipe(Effect.catch(() => Effect.succeed(null))),
        secrets,
      )
    : '';
  return yield* Effect.fail(rejectedResponse(response.status, detail));
});

export const readJson = <A>(
  schema: Schema.Codec<A>,
  request: HttpClientRequest.HttpClientRequest,
  secrets: ReadonlySet<string>,
) =>
  Effect.gen(function* () {
    const response = yield* send(request, secrets);
    const body = yield* response.json.pipe(
      Effect.mapError(() =>
        failure('Cloudflare returned an invalid JSON response.'),
      ),
    );
    const detail = isCloudflareApi(request)
      ? cloudflareMessage(body, secrets)
      : '';
    if (detail) return yield* Effect.fail(failure(detail));

    return yield* Schema.decodeUnknownEffect(schema)(body).pipe(
      Effect.mapError(() =>
        failure(
          'Cloudflare returned an unexpected response; required state-store details are missing or invalid.',
        ),
      ),
    );
  });

// Only expose Cloudflare's structured API errors, never a raw response body.
function cloudflareMessage(body: unknown, secrets: ReadonlySet<string>) {
  if (typeof body !== 'object' || body === null || !('errors' in body))
    return '';
  if (!Array.isArray(body.errors)) return '';
  const messages: string[] = [];
  for (const error of body.errors.slice(0, 3)) {
    if (typeof error !== 'object' || error === null) continue;
    const code =
      'code' in error && typeof error.code === 'number'
        ? ` (code ${error.code})`
        : '';
    if ('message' in error && typeof error.message === 'string')
      messages.push(`${error.message}${code}`);
  }
  return maskMessage(messages.join('; '), secrets);
}

function maskMessage(message: string, secrets: ReadonlySet<string>) {
  // Mask before truncating so a token crossing the length limit cannot leak.
  for (const secret of [...secrets].sort((a, b) => b.length - a.length)) {
    if (!secret) continue;
    for (const value of [
      secret,
      encodeURIComponent(secret),
      JSON.stringify(secret).slice(1, -1),
    ])
      message = message.split(value).join('xxxxxxxx');
  }
  return message.replace(/\s+/g, ' ').trim().slice(0, 500);
}

function requestFailure(
  error: HttpClientError.HttpClientError,
  secrets: ReadonlySet<string>,
) {
  const messages: string[] = [];
  // The wrapper contains request headers. Only read messages/codes from the underlying cause.
  let cause: unknown = 'cause' in error.reason ? error.reason.cause : undefined;
  for (
    let depth = 0;
    depth < 3 && typeof cause === 'object' && cause !== null;
    depth++
  ) {
    if ('message' in cause && typeof cause.message === 'string')
      messages.push(cause.message);
    if ('code' in cause && typeof cause.code === 'string')
      messages.push(cause.code);
    cause = 'cause' in cause ? cause.cause : undefined;
  }
  const detail = maskMessage(messages.join(': '), secrets);
  return detail
    ? `The Cloudflare request could not be completed. ${detail}`
    : 'The Cloudflare request could not be completed. Please retry.';
}
