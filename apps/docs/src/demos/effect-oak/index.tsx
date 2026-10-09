import type { ReactNode } from 'react';
import { Layer } from 'effect';
import { toReact } from 'effect-oak/react';
import { Game, GameView } from './game/index.js';
import { Shell } from './shell/index.js';

/** The whole demo app: one Node, no Services, one React component. */
const GameApp = toReact(Game, GameView, Layer.empty);

export function EffectOakDemo({ menu }: { readonly menu: ReactNode }) {
  const over = GameApp.useRoot()?.state._tag === 'Crashed';
  return <Shell app={GameApp} menu={menu} over={over} />;
}
