import { Effect, Option, Schema } from 'effect';
import { Command } from '../../core/index.ts';
import { Loading } from '../capabilities/index.ts';
import { Adapter } from './adapter/index.ts';

/*
 * The Router's Commands: what it asks of the address, through the Adapter
 * if the Layer has one, and of the Data cache.
 */

/** Through the Adapter, if the Layer has one: in memory, nothing. */
const adapter = (use: (adapter: typeof Adapter.Service) => void) =>
  Effect.serviceOption(Adapter).pipe(
    Effect.map(Option.map(use)),
    Effect.asVoid,
  );

export const write = Command.make('write the address', {
  args: Schema.Struct({
    url: Schema.String,
    key: Schema.String,
    replace: Schema.Boolean,
  }),
  run: ({ url, key, replace }) =>
    adapter((at) => (replace ? at.replace(url, key) : at.push(url, key))),
});
export const go = Command.make('go', {
  args: Schema.Struct({ by: Schema.Number }),
  run: ({ by }) => adapter((at) => at.go(by)),
});
export const leave = Command.make('leave', {
  args: Schema.Struct({
    url: Schema.String,
    replace: Schema.optionalKey(Schema.Boolean),
  }),
  run: ({ url, replace }) =>
    adapter((at) => at.leave(url, replace ? { replace } : undefined)),
});
export const forget = Command.make('forget the Data cache', {
  run: () =>
    Effect.serviceOption(Loading).pipe(
      Effect.flatMap((found) =>
        Option.isSome(found) && found.value.forget
          ? found.value.forget
          : Effect.void,
      ),
    ),
});
