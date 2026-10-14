import { Effect } from 'effect';
import { Proof } from 'laymos/story';

/** The site under test: `KABUKI_START_URL`, or `vp dev` on its local port. */
const SITE =
  globalThis.process?.env.KABUKI_START_URL?.replace(/\/$/, '') ??
  'http://localhost:4317';

/** The cart as the server draws it for the cart cookie given. */
const cart = (cookie?: string) =>
  Effect.promise(async () => {
    const response = await fetch(`${SITE}/shop/cart`, {
      redirect: 'manual',
      headers: cookie ? { cookie } : {},
    });
    const html = await response.text();
    return {
      status: response.status,
      cache: response.headers.get('cache-control'),
      html,
    };
  });

export default Proof.make({
  title:
    'Your cart is drawn from your cookie, inside a shop that is the same for everyone',
  description:
    'A dynamic place under a static one: the shop around the cart is loaded with it, but the page is drawn for this request alone, and never kept.',
  prepare: Effect.succeed({}),
  act: () => Effect.all([cart('cart=mug,mug,poster'), cart()]),
  verify: ([full, empty]) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        `the cart answers 200 (${full.status}, ${empty.status})`,
        full.status === 200 && empty.status === 200,
      );
      yield* Proof.assert(
        'two mugs and a poster: the lines and the total are in the HTML',
        full.html.includes('Enamel mug × 2') &&
          full.html.includes('Route tree poster × 1') &&
          full.html.includes('Total $66'),
      );
      yield* Proof.assert(
        'the shop and the cart are both drawn by the server with their Inputs',
        full.html.includes(
          'data-place="Shop" data-mode="static" data-drawn="server" data-input="server"',
        ) &&
          full.html.includes(
            'data-place="Shop.Cart" data-mode="dynamic" data-drawn="server" data-input="server"',
          ),
      );
      yield* Proof.assert(
        'with no cookie the cart is empty',
        empty.html.includes('The cart is empty.'),
      );
      yield* Proof.assert(
        `neither is kept (${full.cache}, ${empty.cache})`,
        full.cache === 'private, no-store' &&
          empty.cache === 'private, no-store',
      );
    }),
});
