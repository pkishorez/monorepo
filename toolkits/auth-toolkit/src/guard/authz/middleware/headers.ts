/** The header a Browser call names the User it expects to act as by. */
export const EXPECT_USER = 'expect-user';

/** The token of a request's `Authorization: Bearer` header, if any. */
export const bearerToken = (
  headers: Pick<globalThis.Headers, 'get'>,
): string | null => {
  const header = headers.get('authorization');
  const match = header ? /^bearer\s+(\S+)$/i.exec(header) : null;
  return match?.[1] ?? null;
};
