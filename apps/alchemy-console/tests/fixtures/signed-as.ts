// A Local Token naming `id`, so a test backend on `fakeGuard.rpc()`
// sees that User with no Auth Worker. `invalid` names nobody.
const localToken = (id: string) =>
  `local.${Buffer.from(
    JSON.stringify({ id, email: `${id}@example.com`, name: id }),
  ).toString('base64url')}`;

/** The headers a call signed as `id` carries. */
export const signedAs = (id: string) => ({
  authorization: `Bearer ${id === 'invalid' ? 'invalid' : localToken(id)}`,
});
