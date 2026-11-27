import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';
import { Page, Router } from '@kestack/kabuki/routing';
import { Kabuki, KabukiView } from './actor-kabuki/index.js';

export const KabukiPage = Page.define({
  path: '/kabuki',
  query: { session: Schema.optionalKey(Schema.String) },
  message: Schema.TaggedUnion({
    Picked: { name: Schema.NullOr(Schema.String) },
  }),
});

const routeOf = (name: string | null) =>
  name === null
    ? { _tag: 'Kabuki' as const }
    : { _tag: 'Kabuki' as const, session: name };

export const KabukiPageLive = KabukiPage.build({
  children: {
    tool: Actor.child(Kabuki, {
      input: ({ props }) => ({ session: props.query.session ?? null }),
      props: ({ props }) => ({ session: props.query.session ?? null }),
      emits: { Picked: ({ name }) => ({ _tag: 'Picked', name }) },
    }),
  },
  on: {
    Picked: ({ name }, { props }) =>
      name === (props.query.session ?? null)
        ? {}
        : { command: Router.push(routeOf(name)) },
  },
});

export const KabukiPageView = View.make(KabukiPageLive, ({ children }) => (
  <KabukiView instance={children.tool} />
));
