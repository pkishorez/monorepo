import { toReact } from '@kestack/kabuki/react';
import { inspected } from './inspected.ts';
import { DevtoolsLive } from './devtools/actor.ts';
import { DevtoolsView } from './devtools/view.tsx';

/*
 * The tool as an app of its own: its Actors, its Views, and the Layer that
 * hands it code to inspect. Its History is its own, so nothing it does
 * shows on code's timeline or pushes code's Steps out of its Window.
 */
export const Devtools = toReact(DevtoolsLive, DevtoolsView, inspected, {
  name: 'KabukiDevtools',
});
