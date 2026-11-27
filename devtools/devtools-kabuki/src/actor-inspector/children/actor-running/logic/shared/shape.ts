import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import {
  BlueprintNode,
  Entry,
  Look,
  Now,
  Step,
} from '../../../../../server/rpc/session/contract/index.ts';
import { KabukiSession } from '../../../../../services/kabuki-session/contract/index.ts';
import { Place } from '../../../../logic/shared/index.ts';

export type {
  Entry,
  Looked,
  Step,
} from '../../../../../services/kabuki-session/contract/index.ts';

export const RunningShape = Actor.define('Running', {
  description: 'The app’s Instances at the Step shown, over its Timeline',
  requires: [KabukiSession],
  input: { presenting: Schema.Boolean, place: Place },
  model: {
    presenting: Schema.Boolean,
    place: Place,
    print: Schema.NullOr(BlueprintNode),
    now: Schema.NullOr(Now),
    entries: Schema.Array(Entry),
    branch: Schema.NullOr(Schema.Number),
    look: Schema.NullOr(Look),
    opened: Schema.Array(Schema.String),
    closed: Schema.NullOr(Schema.Number),
    playing: Schema.Boolean,
    problem: Schema.NullOr(Schema.String),
  },
  message: {
    Printed: { root: BlueprintNode },
    Heard: { now: Now, entries: Schema.Array(Entry) },
    Looked: { look: Look },
    Failed: { problem: Schema.String },
    Picked: { step: Schema.NullOr(Step) },
    Branched: { id: Schema.Number },
    Forked: {},
    Played: { playing: Schema.Boolean },
    Ticked: {},
    Opened: { id: Schema.String, open: Schema.Boolean },
  },
});

export type Tone = 'took' | 'ignored';

export interface Tick {
  readonly id: number;
  readonly label: string;
  readonly tone: Tone;
}

export interface Next extends Tick {
  readonly on: boolean;
}

export interface Timeline {
  readonly ticks: ReadonlyArray<Tick>;
  readonly at: number | null;
  readonly next: ReadonlyArray<Next>;
  readonly running: boolean;
  readonly place: Place;
}
