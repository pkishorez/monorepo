import { Context, Layer } from 'effect';

/*
 * Who is visiting, kept in two cookies the browser writes and every request
 * carries: `session`, the name they signed in as, and `cart`, the products
 * in their cart. A real app would sign them; here anyone can be anyone.
 *
 * - `Visitor` is how the server reads them: a service made from the request,
 *   by Start's visitor tier, for the dynamic and client Loaders alone, since
 *   a static page is the same for everyone.
 * - `Cookies` is how the browser writes them: signing in and out, and the
 *   cart.
 */

const SESSION = 'session';
const CART = 'cart';
const YEAR = 60 * 60 * 24 * 365;

/** One cookie's value from a `cookie` header, if it is there. */
const read = (header: string | null, name: string): string | undefined => {
  const found = (header ?? '')
    .split(/;\s*/)
    .find((each) => each.startsWith(`${name}=`));
  return found === undefined
    ? undefined
    : decodeURIComponent(found.slice(name.length + 1)) || undefined;
};

/** In the browser: one cookie written for a year, or cleared. */
const write = (name: string, value: string | undefined) => {
  document.cookie =
    value === undefined
      ? `${name}=; path=/; max-age=0; samesite=lax`
      : `${name}=${encodeURIComponent(value)}; path=/; max-age=${YEAR}; samesite=lax`;
};

const cartIn = (header: string | null): ReadonlyArray<string> =>
  read(header, CART)?.split(',').filter(Boolean) ?? [];

/** Who is visiting, as the server reads it from the request. */
export class Visitor extends Context.Service<
  Visitor,
  {
    /** The name they signed in as, if they did. */
    readonly name: string | undefined;
    /** The product ids in their cart, once per item. */
    readonly cart: ReadonlyArray<string>;
  }
>()('kabuki-start/Visitor') {
  /** The visitor a request's cookies say: what Start's visitor tier makes for each request. */
  static readonly fromRequest = (request: Request) => {
    const header = request.headers.get('cookie');
    return Layer.succeed(Visitor, {
      name: read(header, SESSION),
      cart: cartIn(header),
    });
  };
}

/** What the browser writes, for the next request to carry. */
export const Cookies = {
  /** Sign in as `name`. */
  signIn: (name: string) => write(SESSION, name),
  /** Sign out. */
  signOut: () => write(SESSION, undefined),
  /** Put one more of a product in the cart. */
  addToCart: (id: string) =>
    write(CART, [...cartIn(document.cookie), id].join(',')),
  /** Empty the cart. */
  emptyCart: () => write(CART, undefined),
};
