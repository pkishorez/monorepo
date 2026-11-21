/*
 * Two modes only: real, and fake, where an app runs whole in a browser tab
 * over its Fakes. Every fake module carries `FAKE_MARK` in its code (a
 * Fake's warning, a log line, the bubble's tag), so a bundle that brought
 * one in says so; `noFake` fails a production build that does, whatever
 * brought it in. It has no option to turn it off.
 */

/** The mark every fake module's code carries: auth-toolkit's Sign-in fake, Connect's `/fake` and `/browser`, devtools-kabuki's `/fake`, ai-toolkit's `/harness/fake` and `/speech/fake`. */
export const FAKE_MARK = 'kestack-fake';

/** What `noFake` reads of a bundle, the same in Vite and rolldown. */
type Output =
  | { readonly type: 'chunk'; readonly fileName: string; readonly code: string }
  | { readonly type: 'asset'; readonly fileName: string };

/** The chunks of `bundle` that carry a fake. */
export const carryingFake = (
  bundle: Record<string, Output>,
): ReadonlyArray<string> =>
  Object.values(bundle)
    .filter((file) => file.type === 'chunk' && file.code.includes(FAKE_MARK))
    .map(({ fileName }) => fileName);

/** Fails a build whose chunks carry a fake: a Vite or rolldown plugin. */
export const noFake = () => ({
  name: '@kestack/web-platform:no-fake',
  generateBundle(
    this: { error: (message: string) => never },
    _options: unknown,
    bundle: Record<string, Output>,
  ) {
    const files = carryingFake(bundle);
    if (files.length > 0)
      this.error(
        `${files.join(', ')} carr${files.length === 1 ? 'ies' : 'y'} a fake (${FAKE_MARK}), where anyone may sign in and nothing is real. Only fake mode may; a production build never does.`,
      );
  },
});
