import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';
import { Routes } from '../../routes.ts';

/**
 * A URL typed in, read as a Route by the same Routes the server reads. A
 * client place: drawn in the browser alone, and its View, which is heavy,
 * is loaded only when it is first drawn.
 */
export const PlaygroundActor = Actor.make('Playground', {
  props: Routes.Docs.Playground.props,
  model: Schema.Struct({ url: Schema.String }),
  message: Schema.TaggedUnion({ UrlTyped: { url: Schema.String } }),
}).build({
  init: () => ({ model: { url: '/blog/drawn-once' } }),
  on: { UrlTyped: ({ url }) => ({ model: { url } }) },
});

export const Playground = {
  actor: PlaygroundActor,
  view: View.lazy(() => import('./playground.view.tsx')),
};
