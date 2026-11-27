import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import {
  Entry,
  Now,
  Step,
  Stepped,
} from '../../../server/rpc/session/contract/index.ts';
import { KabukiSession } from '../../../services/kabuki-session/contract/index.ts';
import type {
  Change,
  Node,
  Played,
  Runs,
} from '../../../services/kabuki-session/contract/index.ts';

export type {
  BeforeAfter,
  Change,
  Entry,
  From,
  Node,
  Played,
  Shape,
  Step,
  Within,
} from '../../../services/kabuki-session/contract/index.ts';

export const Place = Schema.Literals(['top', 'bottom']);

export type Place = typeof Place.Type;

const Shown = Schema.Struct({
  presenting: Schema.Boolean,
  place: Place,
  world: Schema.Boolean,
});

export type Shown = typeof Shown.Type;

export const InspectorShape = Actor.define('Inspector', {
  description:
    'One Kabuki Session: its Instances at any Step of its History, and what that Step changed',
  requires: [KabukiSession],
  input: Shown,
  model: {
    ...Shown.fields,
    now: Schema.NullOr(Now),
    epoch: Schema.String,
    entries: Schema.Array(Entry),
    branch: Schema.NullOr(Schema.Number),
    shown: Schema.NullOr(Step),
    stepped: Schema.NullOr(Stepped),
    previewing: Schema.Boolean,
    removed: Schema.Boolean,
    compared: Schema.Boolean,
    opened: Schema.NullOr(Schema.String),
    playing: Schema.Boolean,
    problem: Schema.NullOr(Schema.String),
  },
  message: {
    Heard: { now: Now, epoch: Schema.String, entries: Schema.Array(Entry) },
    Read: { stepped: Stepped },
    Failed: { problem: Schema.String },
    Picked: Schema.Struct({ step: Schema.NullOr(Step) }).annotate({
      description:
        'Shows the Instances at a Step of the History, and what its Message changed; null follows the Head',
    }),
    Branched: Schema.Struct({ id: Schema.Number }).annotate({
      description: 'Shows the Step that starts another Branch from here',
    }),
    Previewed: Schema.Struct({ on: Schema.Boolean }).annotate({
      description:
        'Makes the app itself draw the Step shown, or the Head again when off; it keeps its History',
    }),
    Forked: Schema.Struct({}).annotate({
      description:
        'Moves the app’s Head to the Step shown, so its next Message starts a new Branch',
    }),
    Toggled: Schema.Struct({ removed: Schema.Boolean }).annotate({
      description:
        'Shows or hides what a Step removed: stopped Instances, Workers and fields',
    }),
    Compared: Schema.Struct({ on: Schema.Boolean }).annotate({
      description:
        'Shows what each changed value was beside it, or only its new value when off',
    }),
    Opened: Schema.Struct({ address: Schema.NullOr(Schema.String) }).annotate({
      description:
        'Opens one Instance whole, with the Messages it takes; null closes it',
    }),
    Played: Schema.Struct({ playing: Schema.Boolean }).annotate({
      description: 'Plays the Steps one after another, or stops',
    }),
    Ticked: {},
  },
});

export type Changed = Extract<Change, { readonly _tag: 'Changed' }>;

export type Mark = 'started' | 'stopped' | null;

export type Kind = 'same' | 'added' | 'changed' | 'removed';

export interface Field {
  readonly key: string;
  readonly value: unknown;
  readonly before?: unknown;
  readonly kind: Kind;
}

interface Run {
  readonly key: string;
  readonly mark: Mark;
}

export interface Job {
  readonly name: string;
  readonly runs?: Runs;
  readonly mark: Mark;
  readonly sending: boolean;
  readonly keys: ReadonlyArray<Run>;
}

export interface Card {
  readonly node: Node;
  readonly name: string;
  readonly type: string | null;
  readonly ghost: boolean;
  readonly added: boolean;
  readonly changed: boolean;
  readonly was?: string;
  readonly target: boolean;
  readonly sent: string | null;
  readonly model: ReadonlyArray<Field>;
  readonly props: ReadonlyArray<Field>;
  readonly data: ReadonlyArray<Field>;
  readonly workers: ReadonlyArray<Job>;
  readonly stateWorkers: ReadonlyArray<Job>;
  readonly always: ReadonlyArray<string>;
  readonly inState: ReadonlyArray<string>;
  readonly children: ReadonlyArray<Card>;
}

export interface Board {
  readonly root: Card;
  readonly message: Played | null;
  readonly payload: ReadonlyArray<Field>;
  readonly sender: string | null;
  readonly via: string | null;
  readonly compared: boolean;
  readonly loop: boolean;
  readonly key: string;
}

export type Tone = 'took' | 'again' | 'ignored';

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
