import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import {
  Looked,
  Step,
} from '../../../../../server/rpc/session/contract/index.ts';
import { KabukiSession } from '../../../../../services/kabuki-session/contract/index.ts';
import type { Within } from '../../../../logic/shared/index.ts';

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
    'One Instance whole at the Step shown, and the Messages to Send it',
  requires: [KabukiSession],
  input: { address: Schema.String },
  props: {
    at: Schema.NullOr(Step),
    epoch: Schema.String,
    revision: Schema.Number,
  },
  model: {
    address: Schema.String,
    looked: Schema.NullOr(Looked),
    problem: Schema.NullOr(Schema.String),
    sending: Schema.NullOr(Schema.String),
    outcome: Schema.NullOr(Outcome),
  },
  message: {
    Read: { looked: Looked },
    Failed: { problem: Schema.String },
    Submitted: Schema.Struct({
      tag: Schema.String,
      message: Schema.Unknown,
    }).annotate({
      description:
        'Sends a Message to this Instance in the running app; the History grows by the Step it plays',
    }),
    Answered: { tag: Schema.String, said: Said },
    Refused: { tag: Schema.String, said: Said, reason: Schema.String },
    Edited: Schema.Struct({ tag: Schema.String }).annotate({
      description: 'Clears what the last Send of this Message answered',
    }),
    NowAsked: Schema.Struct({}).annotate({
      description: 'Shows the Head, where Messages can be Sent',
    }),
    Closed: Schema.Struct({}).annotate({ description: 'Closes this Instance' }),
  },
  emits: { NowAsked: {}, Closed: {} },
});

export interface Action {
  readonly tag: string;
  readonly description?: string;
  readonly within: Within;
  readonly input: Input;
}

type Choice = string | number | boolean;

export interface FormField {
  readonly name: string;
  readonly description?: string;
  readonly optional: boolean;
  readonly nullable: boolean;
  readonly input: Input;
}

export type Input =
  | { readonly kind: 'text' }
  | { readonly kind: 'number' }
  | { readonly kind: 'switch' }
  | { readonly kind: 'choice'; readonly options: ReadonlyArray<Choice> }
  | { readonly kind: 'group'; readonly fields: ReadonlyArray<FormField> }
  | { readonly kind: 'json'; readonly hint: string };

export type Draft = string | boolean | { readonly [name: string]: Draft };

export interface Problem {
  readonly path: string;
  readonly problem: string;
}

export type Built =
  | { readonly _tag: 'Built'; readonly value: unknown }
  | { readonly _tag: 'Unbuilt'; readonly problems: ReadonlyArray<Problem> };
