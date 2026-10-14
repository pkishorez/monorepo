import { Effect } from 'effect';
import { Proof } from 'laymos/story';

/** The site under test: `KABUKI_START_URL`, or `vp dev` on its local port. */
const SITE =
  globalThis.process?.env.KABUKI_START_URL?.replace(/\/$/, '') ??
  'http://localhost:4317';

/** One ask of the Loader endpoint, as the browser makes it after a click. */
const load = (body: unknown, cookie?: string) =>
  Effect.promise(async () => {
    const response = await fetch(`${SITE}/_kabuki/load`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'content-type': 'application/json',
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    let answer: {
      _tag?: string;
      inputs?: Record<string, { title?: string; name?: string }>;
      route?: unknown;
    } = {};
    try {
      answer = JSON.parse(text);
    } catch {}
    return { status: response.status, answer };
  });

export default Proof.make({
  title: 'The Loader endpoint answers Loaded, NotFound or Redirect',
  description:
    'POST /_kabuki/load is what the browser asks after a click: every place in one request, each Loader handed the request with its cookies. A malformed ask is a 400.',
  prepare: Effect.succeed({}),
  act: () =>
    Effect.all([
      load({
        places: [
          { name: 'Blog', params: {} },
          { name: 'Blog.Post', params: { slug: 'back-is-free' } },
        ],
      }),
      load({ places: [{ name: 'Blog.Post', params: { slug: 'missing' } }] }),
      load({ places: [{ name: 'Account', params: {} }] }),
      load({ places: [{ name: 'Account', params: {} }] }, 'session=Grace'),
      load({ nonsense: true }),
    ]),
  verify: ([both, missing, signedOut, signedIn, malformed]) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        `two places in one ask: Loaded with both (${Object.keys(both.answer.inputs ?? {}).join(', ')})`,
        both.status === 200 &&
          both.answer._tag === 'Loaded' &&
          both.answer.inputs?.['Blog.Post']?.title === 'Back is free' &&
          both.answer.inputs?.['Blog'] !== undefined,
      );
      yield* Proof.assert(
        `a missing post: NotFound (${missing.answer._tag})`,
        missing.answer._tag === 'NotFound',
      );
      yield* Proof.assert(
        `the account, signed out: Redirect to ${JSON.stringify(signedOut.answer.route)}`,
        signedOut.answer._tag === 'Redirect' &&
          JSON.stringify(signedOut.answer.route) === '{"_tag":"SignIn"}',
      );
      yield* Proof.assert(
        `the account, with Grace's cookie: Loaded as ${signedIn.answer.inputs?.['Account']?.name}`,
        signedIn.answer._tag === 'Loaded' &&
          signedIn.answer.inputs?.['Account']?.name === 'Grace',
      );
      yield* Proof.assert(
        `a malformed ask: 400 (${malformed.status})`,
        malformed.status === 400,
      );
    }),
});
