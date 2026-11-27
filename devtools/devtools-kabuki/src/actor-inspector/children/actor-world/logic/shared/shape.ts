import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { FakeNow } from '../../../../../server/rpc/session/contract/index.ts';
import { KabukiSession } from '../../../../../services/kabuki-session/contract/index.ts';
import type { Input } from '../../../../logic/shared/index.ts';

const Refusal = Schema.Struct({
  fake: Schema.String,
  control: Schema.String,
  reason: Schema.String,
});

export const WorldShape = Actor.define('World', {
  description:
    'The app’s FakeWorld: each Fake as it is now, and its controls, each run without waiting',
  requires: [KabukiSession],
  model: {
    fakes: Schema.NullOr(Schema.Array(FakeNow)),
    refusal: Schema.NullOr(Refusal),
  },
  message: {
    Heard: { fakes: Schema.Array(FakeNow) },
    Ran: Schema.Struct({
      fake: Schema.String,
      control: Schema.String,
      payload: Schema.Unknown,
    }).annotate({
      description:
        'Runs one control of one Fake and does not wait: what it changes shows in the Fake’s state, and only a refusal comes back',
    }),
    Refused: Refusal,
    Dismissed: Schema.Struct({}).annotate({
      description: 'Clears the reason the last control was refused',
    }),
  },
});

export interface Control {
  readonly name: string;
  readonly label: string;
  readonly description?: string;
  readonly input: Input;
  readonly bare: boolean;
}

export interface Fake {
  readonly name: string;
  readonly label: string;
  readonly value: unknown;
  readonly fields: ReadonlyArray<readonly [string, unknown]>;
  readonly controls: ReadonlyArray<Control>;
  readonly refusal: (typeof Refusal.Type & { readonly label: string }) | null;
}
