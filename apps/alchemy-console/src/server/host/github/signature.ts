/*
 * GitHub signs each webhook delivery with the App's webhook secret:
 * `X-Hub-Signature-256: sha256=<hex HMAC-SHA256 of the raw body>`. Web
 * Crypto's `verify` compares in constant time. No secret, or no signature,
 * verifies nothing.
 */

const hexBytes = (hex: string) =>
  /^([0-9a-f]{2})+$/i.test(hex)
    ? Uint8Array.from(hex.match(/../g)!, (pair) => parseInt(pair, 16))
    : null;

/** Whether `header` signs `body` with `secret`. */
export const signedBy = async (
  secret: string | undefined,
  header: string | null,
  body: Uint8Array<ArrayBuffer>,
): Promise<boolean> => {
  if (!secret || header === null || !header.startsWith('sha256=')) return false;
  const signature = hexBytes(header.slice('sha256='.length));
  if (signature === null || signature.length !== 32) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  return crypto.subtle.verify('HMAC', key, signature, body);
};
