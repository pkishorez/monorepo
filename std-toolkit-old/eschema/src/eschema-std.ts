import { ESchema } from './eschema.js';
import { EmptyEvolution } from './types.js';

export type EmptyStdESchema = StdESchema<string, EmptyEvolution[], EmptyKeyDef>;
type EmptyKeyDef = KeyDef<any, any>;
type KeyDef<T, K extends keyof T> = {
  deps: K[];
  encode: (value: Pick<T, K>) => string;
};
export class StdESchema<
  TName extends string,
  TEvolutions extends EmptyEvolution[],
  TKey extends KeyDef<
    ESchema<TEvolutions>['Type'],
    keyof ESchema<TEvolutions>['Type']
  >,
> extends ESchema<TEvolutions> {
  constructor(
    public name: TName,
    evolutions: TEvolutions,
    public keyDef: TKey,
  ) {
    super(evolutions);
  }

  KeyType = null as any as TKey['deps'][number];

  static make<N extends string, E extends EmptyEvolution[]>(
    name: N,
    eschema: ESchema<E>,
  ) {
    return {
      key: <Key extends keyof ESchema<E>['Type']>(
        keyDef: KeyDef<ESchema<E>['Type'], Key>,
      ) => {
        return {
          build: () => {
            return new StdESchema(
              name,
              (eschema as any).evolutions as E,
              keyDef,
            );
          },
        };
      },
    };
  }
}
