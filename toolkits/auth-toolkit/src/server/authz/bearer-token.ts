/** The token of a request's `Authorization: Bearer` header, if any. */
export const bearerToken = (request: Request): string | null => {
  const header = request.headers.get('authorization');
  const match = header ? /^bearer\s+(\S+)$/i.exec(header) : null;
  return match?.[1] ?? null;
};
