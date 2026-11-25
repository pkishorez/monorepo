import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { KabukiSessionSummary } from '@kestack/devtools-kabuki/server';
import { Sessions } from '../../../services/sessions/contract/index.js';

const Link = Schema.Literals(['connecting', 'live', 'reconnecting']);

const Name = Schema.NullOr(Schema.String);

const State = Schema.TaggedUnion({
  Choice: {},
  Inspection: { name: Schema.String },
  Absence: { name: Schema.String },
});

export type Link = typeof Link.Type;
export type State = typeof State.Type;
export type Summary = typeof KabukiSessionSummary.Type;

export const KabukiShape = Actor.define('Kabuki', {
  requires: [Sessions],
  input: Schema.Struct({ session: Name }),
  props: Schema.UndefinedOr(Schema.Struct({ session: Name })),
  model: Schema.Struct({
    sessions: Schema.NullOr(Schema.Array(KabukiSessionSummary)),
    link: Link,
  }),
  state: State,
  message: Schema.TaggedUnion({
    Listed: { sessions: Schema.Array(KabukiSessionSummary) },
    Dropped: {},
    Chosen: { name: Name },
    Followed: { name: Name },
  }),
  emits: { Picked: { name: Name } },
});
