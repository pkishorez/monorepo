/*
 * A run's token: what a runner shows at `/runner` to speak for one run of
 * one user. It names the user and the run and when it stops being good, and
 * is signed with a key derived from the Vault key, which never leaves the
 * Worker: the User Space mints it for the container it starts, and the
 * Worker checks it before handing the socket to that user's User Space, so
 * a token can reach no other user's runs, and no other run of theirs.
 *
 *   v1.<base64url of {"u":userId,"r":runId,"e":expiresAt}>.<base64url HMAC-SHA256>
 */

const VERSION = 'v1';
const LABEL = 'alchemy-console/run-token/v1';

export interface RunClaim {
  readonly userId: string;
  readonly runId: string;
}

const encoder = new TextEncoder();

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');

const fromBase64url = (text: string): Uint8Array | null => {
  try {
    const padded = text.replaceAll('-', '+').replaceAll('_', '/');
    return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
};

const hmacKey = (raw: Uint8Array, usage: 'sign' | 'verify') =>
  crypto.subtle.importKey(
    'raw',
    raw as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage],
  );

/** The signing key: the Vault key's HMAC of a label of its own, so it seals nothing else. */
const signingKey = async (vaultKey: string, usage: 'sign' | 'verify') => {
  const root = fromBase64url(vaultKey.trim());
  if (root === null || root.length !== 32)
    throw new Error('CONSOLE_VAULT_KEY must be 32 bytes, in base64.');
  const derived = await crypto.subtle.sign(
    'HMAC',
    await hmacKey(root, 'sign'),
    encoder.encode(LABEL),
  );
  return hmacKey(new Uint8Array(derived), usage);
};

/** A token for `claim`, good until `expiresAt` (milliseconds since the epoch). */
export const mint = async (
  vaultKey: string,
  claim: RunClaim & { readonly expiresAt: number },
): Promise<string> => {
  const payload = base64url(
    encoder.encode(
      JSON.stringify({ u: claim.userId, r: claim.runId, e: claim.expiresAt }),
    ),
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    await signingKey(vaultKey, 'sign'),
    encoder.encode(`${VERSION}.${payload}`),
  );
  return `${VERSION}.${payload}.${base64url(new Uint8Array(signature))}`;
};

/** Who and which run `token` speaks for at `now`; null when it is forged, malformed or spent. */
export const verify = async (
  vaultKey: string,
  token: string,
  now: number,
): Promise<RunClaim | null> => {
  const [version, payload, signature, ...rest] = token.split('.');
  if (version !== VERSION || !payload || !signature || rest.length > 0)
    return null;
  const signed = fromBase64url(signature);
  if (signed === null) return null;
  const valid = await crypto.subtle.verify(
    'HMAC',
    await signingKey(vaultKey, 'verify'),
    signed as BufferSource,
    encoder.encode(`${version}.${payload}`),
  );
  if (!valid) return null;
  const bytes = fromBase64url(payload);
  if (bytes === null) return null;
  try {
    const claim = JSON.parse(new TextDecoder().decode(bytes)) as {
      readonly u?: unknown;
      readonly r?: unknown;
      readonly e?: unknown;
    };
    if (
      typeof claim.u !== 'string' ||
      typeof claim.r !== 'string' ||
      typeof claim.e !== 'number' ||
      claim.u === '' ||
      claim.r === '' ||
      now >= claim.e
    )
      return null;
    return { userId: claim.u, runId: claim.r };
  } catch {
    return null;
  }
};
