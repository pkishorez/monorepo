import type { Binding } from '../../core/binding/index.ts';
import type { Definition } from './definition.ts';

type Join<P extends string, K extends string> = P extends '' ? K : `${P}.${K}`;

/** Every Surface's id in a definition: `'inbox'`, `'inbox.reply'`. */
export type SurfaceId<D, P extends string = ''> = D extends {
  readonly surfaces: infer S;
}
  ? {
      [K in keyof S & string]: Join<P, K> | SurfaceId<S[K], Join<P, K>>;
    }[keyof S & string]
  : never;

/**
 * Every Action's id in a definition: its Surface's id and its name,
 * `'inbox.archive'`, or its name alone for a Global Action.
 */
export type ActionId<D, P extends string = ''> =
  | (D extends { readonly actions: infer A }
      ? Join<P, keyof A & string>
      : never)
  | (D extends { readonly surfaces: infer S }
      ? {
          [K in keyof S & string]: ActionId<S[K], Join<P, K>>;
        }[keyof S & string]
      : never);

/** The user's own Bindings, by Action id; each replaces all its defaults. */
export type Bindings<D extends Definition> = {
  readonly [Id in ActionId<D>]?: ReadonlyArray<Binding>;
};
