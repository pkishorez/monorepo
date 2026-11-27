import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { KabukiSessionSummary } from '@kestack/devtools-kabuki/devtools';
import { Sessions } from '../../../services/sessions/contract/index.js';

const Link = Schema.Literals(['connecting', 'live', 'reconnecting']);

const Name = Schema.NullOr(Schema.String);

const Tab = Schema.Literals(['inspector', 'story']);

const State = Schema.TaggedUnion({
  Choice: {},
  Inspection: { name: Schema.String },
  Absence: { name: Schema.String },
});

export type Link = typeof Link.Type;
export type Tab = typeof Tab.Type;
export type State = typeof State.Type;
export type Summary = typeof KabukiSessionSummary.Type;

export const KabukiShape = Actor.define('Kabuki', {
  requires: [Sessions],
  input: Schema.Struct({ session: Name }),
  props: Schema.UndefinedOr(Schema.Struct({ session: Name })),
  model: Schema.Struct({
    sessions: Schema.NullOr(Schema.Array(KabukiSessionSummary)),
    link: Link,
    tab: Tab,
  }),
  state: State,
  message: {
    Listed: { sessions: Schema.Array(KabukiSessionSummary) },
    Dropped: {},
    Chosen: Schema.Struct({ name: Name }).annotate({
      description:
        'Open a live Kabuki Session by its name, or none; the page follows',
    }),
    Followed: { name: Name },
    Tabbed: Schema.Struct({ tab: Tab }).annotate({
      description:
        "Show the open Kabuki Session's Inspector, or its Story told from its code",
    }),
  },
  emits: { Picked: { name: Name } },
});
