import { View } from '@kestack/kabuki/react';
import { Start } from '@kestack/kabuki/start';
import { attach } from './inspected.ts';
import { KabukiLive } from './actor.ts';
import { Devtools } from './app.ts';

/*
 * The page: the tool, an app of its own (`devtools/`), drawn in code's
 * tree but run apart from it.
 */

export const KabukiView = View.make(KabukiLive, ({ root }) => {
  // What code's Instances provide is known only to its Runtime.
  attach(Start.useRuntime());
  return (
    <div {...root}>
      <Devtools />
    </div>
  );
});
