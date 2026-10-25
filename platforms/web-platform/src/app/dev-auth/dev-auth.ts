/*
 * Auth in development, the same for an app's site and its backends: under
 * `pnpm dev` everything signs in with auth-toolkit's Fake, which the
 * `kestack-fake-auth` export condition swaps in for the real doors, unless
 * the run says `KESTACK_AUTH=real` (`pnpm dev:real`). A production build
 * never sets the condition, and `noFakeAuth` fails one that carries the
 * Fake anyway.
 */

/** auth-toolkit's export condition for its Fake, and the mark its code carries. */
export const FAKE_AUTH = 'kestack-fake-auth';

/** Whether a run signs in with the Fake: under development, unless `KESTACK_AUTH=real`. */
export const isFakeAuth = (dev: boolean): boolean =>
  dev && process.env['KESTACK_AUTH'] !== 'real';

/** What `noFakeAuth` reads of a bundle, the same in Vite and rolldown. */
type Output =
  | { readonly type: 'chunk'; readonly fileName: string; readonly code: string }
  | {
      readonly type: 'asset';
      readonly fileName: string;
      readonly source: string | Uint8Array;
    };

/** The files of `bundle` that carry the Fake. */
export const carryingFake = (
  bundle: Record<string, Output>,
): ReadonlyArray<string> =>
  Object.values(bundle)
    .filter((file) =>
      (file.type === 'chunk'
        ? file.code
        : typeof file.source === 'string'
          ? file.source
          : new TextDecoder().decode(file.source)
      ).includes(FAKE_AUTH),
    )
    .map(({ fileName }) => fileName);

/**
 * Fails a build whose output carries auth-toolkit's Fake, whatever brought
 * it in: a Vite or rolldown plugin. It has no option to turn it off.
 */
export const noFakeAuth = () => ({
  name: '@kestack/web-platform:no-fake-auth',
  generateBundle(
    this: { error: (message: string) => never },
    _options: unknown,
    bundle: Record<string, Output>,
  ) {
    const files = carryingFake(bundle);
    if (files.length > 0)
      this.error(
        `${files.join(', ')} carr${files.length === 1 ? 'ies' : 'y'} auth-toolkit's Fake (${FAKE_AUTH}), where anyone may sign in. A build that is not development never may.`,
      );
  },
});

/** One backend the dev server answers for on its own origin. */
export interface Backend {
  /** The `define` key Vite inlines, `import.meta.env.VITE_<NAME>_URL`. */
  readonly key: string;
  /** Its path on the site's origin, `/rpc-<name>`. */
  readonly path: string;
  /** Where the dev server sends it. */
  readonly target: string;
}

const URL_KEY = /^import\.meta\.env\.VITE_(\w+)_URL$/;

/**
 * Every backend in `define`: each `VITE_<NAME>_URL` holding an http(s) URL,
 * but `VITE_AUTH_URL`, which the Fake does not call, at `/rpc-<name>`.
 */
export const backendsOf = (
  define: Record<string, unknown>,
): ReadonlyArray<Backend> =>
  Object.entries(define).flatMap(([key, value]) => {
    const name = URL_KEY.exec(key)?.[1];
    if (name === undefined || name === 'AUTH' || typeof value !== 'string')
      return [];
    let target: unknown;
    try {
      target = JSON.parse(value);
    } catch {
      return [];
    }
    return typeof target === 'string' && /^https?:\/\//.test(target)
      ? [
          {
            key,
            path: `/rpc-${name.toLowerCase().replace(/_/g, '-')}`,
            target,
          },
        ]
      : [];
  });
