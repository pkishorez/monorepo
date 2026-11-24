import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';
import { Page, Router } from '@kestack/kabuki/routing';
import { Kabuki, KabukiView } from './actor-kabuki/index.js';

/*
 * `/kabuki`: the Kabuki Tool, with the Kabuki Session it shows in
 * `?session=`, so a link opens it. The address is all the page knows: it
 * keeps no Model.
 *
 * 1. Start  the Tool starts on the Kabuki Session the address names.
 * 2. Pick   the Tool says which one it picked, and the page writes it in
 *           `?session=`, a new history entry, unless the address names it
 *           already.
 * 3. Move   Back, Forward or a typed address hands the Tool the one it now
 *           names, as Props, and the same Tool moves to it. Its own pick
 *           comes back that way too, naming the one it shows: nothing moves.
 */

export const KabukiPage = Page.define({
  path: '/kabuki',
  query: { session: Schema.optionalKey(Schema.String) },
  message: Schema.TaggedUnion({
    Picked: { name: Schema.NullOr(Schema.String) },
  }),
});

/** The page's Route with the Kabuki Session named, or none. */
const routeOf = (name: string | null) =>
  name === null
    ? { _tag: 'Kabuki' as const }
    : { _tag: 'Kabuki' as const, session: name };

export const KabukiPageLive = KabukiPage.build({
  children: {
    tool: Actor.child(Kabuki, {
      // 1. Start
      input: ({ props }) => ({ session: props.query.session ?? null }),
      // 3. Move
      props: ({ props }) => ({ session: props.query.session ?? null }),
      // 2. Pick
      emits: { Picked: ({ name }) => ({ _tag: 'Picked', name }) },
    }),
  },
  on: {
    // 2. Pick
    Picked: ({ name }, { props }) =>
      name === (props.query.session ?? null)
        ? {}
        : { command: Router.push(routeOf(name)) },
  },
});

export const KabukiPageView = View.make(KabukiPageLive, ({ children }) => (
  <KabukiView instance={children.tool} />
));
