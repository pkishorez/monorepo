import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import {
  BlueprintNode,
  Opened,
  Step,
} from '../../../../../../../server/rpc/session/contract/index.ts';
import { KabukiSession } from '../../../../../../../services/kabuki-session/contract/index.ts';
import type { Input } from '../../../../../../logic/shared/index.ts';

const Said = Schema.Literals([
  'handled',
  'ignored',
  'queued',
  'refused',
  'failed',
]);

const Outcome = Schema.Struct({
  tag: Schema.String,
  said: Said,
  reason: Schema.optionalKey(Schema.String),
});

export type Outcome = typeof Outcome.Type;

export const InstanceShape = Actor.define('Instance', {
  description:
    'One open card: an Instance’s data at the Step shown, and the Messages to Send it',
  requires: [KabukiSession],
  input: { address: Schema.String },
  props: {
    at: Schema.NullOr(Step),
    revision: Schema.Number,
    print: BlueprintNode,
    state: Schema.String,
  },
  model: {
    address: Schema.String,
    opened: Schema.NullOr(Opened),
    problem: Schema.NullOr(Schema.String),
    sending: Schema.NullOr(Schema.String),
    outcome: Schema.NullOr(Outcome),
  },
  message: {
    Read: { opened: Opened },
    Failed: { problem: Schema.String },
    Submitted: { tag: Schema.String, message: Schema.Unknown },
    Answered: { tag: Schema.String, said: Said },
    Refused: { tag: Schema.String, said: Said, reason: Schema.String },
    NowAsked: {},
  },
  emits: { NowAsked: {} },
});

export interface Action {
  readonly tag: string;
  readonly description?: string;
  readonly input: Input;
}
