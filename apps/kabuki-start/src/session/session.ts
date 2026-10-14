/*
 * The pretend session: who is signed in, and what is in the cart, each a
 * cookie the browser writes and every request carries. A real app would
 * sign it; here anyone can be anyone.
 */

const SESSION = 'session';
const CART = 'cart';
const YEAR = 60 * 60 * 24 * 365;

const cookie = (header: string | null, name: string): string | undefined => {
  const found = (header ?? '')
    .split(/;\s*/)
    .find((each) => each.startsWith(`${name}=`));
  return found === undefined
    ? undefined
    : decodeURIComponent(found.slice(name.length + 1)) || undefined;
};

const write = (name: string, value: string | undefined) => {
  document.cookie =
    value === undefined
      ? `${name}=; path=/; max-age=0; samesite=lax`
      : `${name}=${encodeURIComponent(value)}; path=/; max-age=${YEAR}; samesite=lax`;
};

const cartIn = (header: string | null): ReadonlyArray<string> =>
  cookie(header, CART)?.split(',').filter(Boolean) ?? [];

export const Session = {
  /** Who the request is from, if anyone is signed in. */
  user: (request: Request): string | undefined =>
    cookie(request.headers.get('cookie'), SESSION),
  /** The product ids in the request's cart, once per item. */
  cart: (request: Request): ReadonlyArray<string> =>
    cartIn(request.headers.get('cookie')),
  /** In the browser: sign in as `name`. */
  signIn: (name: string) => write(SESSION, name),
  /** In the browser: sign out. */
  signOut: () => write(SESSION, undefined),
  /** In the browser: put one more of a product in the cart. */
  addToCart: (id: string) =>
    write(CART, [...cartIn(document.cookie), id].join(',')),
  /** In the browser: empty the cart. */
  emptyCart: () => write(CART, undefined),
};
