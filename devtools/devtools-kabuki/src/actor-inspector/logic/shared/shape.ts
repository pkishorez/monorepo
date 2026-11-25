import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { FakeNow } from '../../../server/rpc/session/contract/index.ts';
import { KabukiSession } from '../../../services/kabuki-session/contract/index.ts';
import type {
  BlueprintNode,
  Change,
  Outcome,
} from '../../../services/kabuki-session/contract/index.ts';

export type {
  BlueprintNode,
  Opened,
  Shape,
} from '../../../services/kabuki-session/contract/index.ts';

export const Place = Schema.Literals(['top', 'bottom']);

export type Place = typeof Place.Type;

const Tab = Schema.Literals(['Running', 'Blueprint', 'World']);

export type Tab = typeof Tab.Type;

const Shown = Schema.Struct({ presenting: Schema.Boolean, place: Place });

export type Shown = typeof Shown.Type;

export const InspectorShape = Actor.define('Inspector', {
  description:
    'One Kabuki Session at any Step of its History, its Blueprint, or its FakeWorld',
  requires: [KabukiSession],
  input: Shown,
  model: { ...Shown.fields, fakes: Schema.Array(FakeNow) },
  state: { Running: {}, Blueprint: {}, World: {} },
  message: {
    Viewed: { tab: Tab },
    Listed: { fakes: Schema.Array(FakeNow) },
  },
});

export interface Card {
  readonly id: string;
  readonly name: string;
  readonly key?: string;
  readonly print: BlueprintNode;
  readonly state: string | null;
  readonly change: Change;
  readonly took?: { readonly message: string; readonly outcome: Outcome };
  readonly children: ReadonlyArray<Card>;
}

type Print = BlueprintNode['top'];

export type Condition = Print['workers'][number]['condition'];

export interface CardLevel {
  readonly key: string;
  readonly workers: Print['workers'];
  readonly messages: Print['messages'];
  readonly children: Print['children'];
  readonly gives: ReadonlyArray<string>;
}

export type Kind = 'added' | 'changed' | 'removed';

export type Mode = 'blueprint' | 'active' | 'all';

export type Part =
  | { readonly kind: 'state'; readonly name: string }
  | { readonly kind: 'worker'; readonly name: string }
  | { readonly kind: 'message'; readonly name: string; readonly state?: string }
  | { readonly kind: 'child'; readonly name: string }
  | { readonly kind: 'model' }
  | { readonly kind: 'props' }
  | { readonly kind: 'requires'; readonly name?: string }
  | { readonly kind: 'provides'; readonly name?: string };

export interface Use {
  readonly name: string;
  readonly from: string | null;
}

export type Choice = string | number | boolean;

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
