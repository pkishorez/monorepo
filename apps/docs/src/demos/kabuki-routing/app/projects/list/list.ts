import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { Navigation, Router } from '@kestack/kabuki/routing';
import { Routes } from '../../../routes/index.ts';

/**
 * The project list, searched by `?q=`: what Projects draws while the URL
 * ends at it. It is no page, a Child of Projects', handed the query as
 * Props, so a new one keeps this Instance. Typing replaces the entry; when
 * Back brings an older query, `follow` puts it in the box.
 */
export const ListActor = Actor.make('List', {
  requires: [Navigation],
  props: Schema.Struct({ q: Schema.optionalKey(Schema.String) }),
  model: Schema.Struct({ draft: Schema.String }),
  message: Schema.TaggedUnion({
    Typed: { q: Schema.String },
    QueryRead: { q: Schema.String },
  }),
}).build({
  init: () => ({ model: { draft: '' } }),
  workers: {
    follow: {
      each: ({ props }) => [props.q ?? ''],
      run: (self, q) => self.send({ _tag: 'QueryRead', q }),
    },
  },
  on: {
    Typed: ({ q }) => ({
      model: { draft: q },
      command: Router.replace(() => Routes.Projects(q ? { q } : {})),
    }),
    QueryRead: ({ q }, { model }) =>
      model.draft === q ? {} : { model: { draft: q } },
  },
});
