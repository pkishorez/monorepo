import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { FakeNow } from '../../../../../server/rpc/session/contract/index.ts';
import { KabukiSession } from '../../../../../services/kabuki-session/contract/index.ts';
import type { Input } from '../../../../logic/shared/index.ts';

const Said = Schema.Literals(['running', 'done', 'refused']);

const Outcome = Schema.Struct({
  fake: Schema.String,
  control: Schema.String,
  said: Said,
  reason: Schema.optionalKey(Schema.String),
});

export type Outcome = typeof Outcome.Type;

export const WorldShape = Actor.define('World', {
  description:
    'The app’s FakeWorld: each Fake’s state now, and its controls to run',
  requires: [KabukiSession],
  props: { fakes: Schema.Array(FakeNow) },
  model: { outcomes: Schema.Array(Outcome) },
  message: {
    Submitted: {
      fake: Schema.String,
      control: Schema.String,
      payload: Schema.Unknown,
    },
    Ran: { fake: Schema.String, control: Schema.String },
    Refused: {
      fake: Schema.String,
      control: Schema.String,
      reason: Schema.String,
    },
  },
});

export interface Control {
  readonly name: string;
  readonly input: Input;
  readonly bare: boolean;
  readonly outcome: Outcome | undefined;
}

export interface Shown {
  readonly name: string;
  readonly value: unknown;
  readonly controls: ReadonlyArray<Control>;
}
