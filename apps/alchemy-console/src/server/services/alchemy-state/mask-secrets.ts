// Alchemy encodes Effect Redacted values using this marker on the wire.
// Also mask conventional credential fields, including inside replacement history and outputs.
const secretKey =
  /^(?:authToken|apiToken|apiKey|accessToken|refreshToken|sessionToken|secretAccessKey|password|passwd|secret|clientSecret|privateKey|authorization|credentials|token)$/i;

export const maskSecrets = (value: unknown, authToken: string): unknown => {
  if (typeof value === 'string')
    return authToken ? value.replaceAll(authToken, 'xxxxxxxx') : value;
  if (Array.isArray(value))
    return value.map((item) => maskSecrets(item, authToken));
  if (value !== null && typeof value === 'object') {
    if (Object.hasOwn(value, '__redacted__')) return 'xxxxxxxx';
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        secretKey.test(key.replace(/[-_]/g, ''))
          ? 'xxxxxxxx'
          : maskSecrets(item, authToken),
      ]),
    );
  }
  return value;
};
