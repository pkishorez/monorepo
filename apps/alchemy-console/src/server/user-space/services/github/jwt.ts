/*
 * The GitHub App's own JWT: RS256 over `{ iat, exp, iss }` with the App's
 * private key, signed with Web Crypto, as the Workers runtime has it.
 * GitHub hands out the key as PKCS#1 (`BEGIN RSA PRIVATE KEY`); Web Crypto
 * imports only PKCS#8, so a PKCS#1 key is wrapped in the PKCS#8 envelope
 * first. A key kept on one line has its newlines written `\n`.
 */

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const text = (value: unknown) =>
  base64url(new TextEncoder().encode(JSON.stringify(value)));

const derLength = (length: number) =>
  length < 0x80
    ? [length]
    : length < 0x100
      ? [0x81, length]
      : length < 0x10000
        ? [0x82, length >> 8, length & 0xff]
        : [0x83, length >> 16, (length >> 8) & 0xff, length & 0xff];

const der = (tag: number, body: Uint8Array) =>
  Uint8Array.from([tag, ...derLength(body.length), ...body]);

// version 0, then the rsaEncryption algorithm with its NULL parameters.
const PKCS8_VERSION = [0x02, 0x01, 0x00];
const RSA_ALGORITHM = [
  0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01,
  0x05, 0x00,
];

const pkcs8Of = (pkcs1: Uint8Array) =>
  der(
    0x30,
    Uint8Array.from([...PKCS8_VERSION, ...RSA_ALGORITHM, ...der(0x04, pkcs1)]),
  );

/** The key's PKCS#8 bytes, from either PEM GitHub or OpenSSL writes. */
const keyBytes = (pem: string) => {
  const normal = pem.replace(/\\n/g, '\n');
  const pkcs1 = normal.includes('BEGIN RSA PRIVATE KEY');
  const body = normal
    .replace(/-----(BEGIN|END) [A-Z ]+-----/g, '')
    .replace(/\s+/g, '');
  const bytes = Uint8Array.from(atob(body), (char) => char.charCodeAt(0));
  return pkcs1 ? pkcs8Of(bytes) : bytes;
};

/** Imports `pem` once, for signing App JWTs. */
export const signingKey = (pem: string) =>
  crypto.subtle.importKey(
    'pkcs8',
    keyBytes(pem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

/** A JWT for App `appId`, good for nine minutes from `now` (in seconds); GitHub allows ten. */
export const appJwt = async (key: CryptoKey, appId: string, now: number) => {
  const unsigned = `${text({ alg: 'RS256', typ: 'JWT' })}.${text({
    // A minute back, for a clock running ahead of GitHub's.
    iat: now - 60,
    exp: now + 9 * 60,
    iss: appId,
  })}`;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsigned),
  );
  return `${unsigned}.${base64url(new Uint8Array(signature))}`;
};
