import type { ReactNode } from 'react';
import { KabukiDevtools, connect } from '@kestack/devtools-kabuki/app';
import { FakeWorld } from '@kestack/kabuki/fake';
import { Start } from '@kestack/kabuki/start';
import { document } from '@kestack/web-platform/app/document';
import { PlaygroundView, router } from './app/actor.tsx';
import { Theme } from './app/theme.tsx';
import { server } from './services/server/fake/index.ts';
import './styles.css';

const world = FakeWorld.make([server]);

function Devtools({ children }: { readonly children: ReactNode }) {
  return (
    <KabukiDevtools
      runtime={Start.useRuntime()}
      world={world}
      storageKey="kabuki-playground:devtools"
    >
      {children}
    </KabukiDevtools>
  );
}

export default Start.app({
  router,
  view: PlaygroundView,
  name: 'kabuki-playground',
  document: document({
    theme: Theme,
    around: (app) => <Devtools>{app}</Devtools>,
  }),
  layer: world.layer,
  attach: [connect({ world, name: 'kabuki-playground' })],
});
