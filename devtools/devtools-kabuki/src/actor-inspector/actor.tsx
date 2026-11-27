import { Actor } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';
import { Blueprint, BlueprintView } from './children/actor-blueprint/index.ts';
import { Running, RunningView } from './children/actor-running/index.ts';
import { World, WorldView } from './children/actor-world/index.ts';
import { InspectorShape, init, updates, workers } from './logic/index.ts';
import { Body } from './view/index.ts';

export const Inspector = InspectorShape.build({
  init,
  on: updates,
  workers,
  states: {
    Running: {
      children: {
        running: Actor.child(Running, {
          input: ({ model }) => ({
            presenting: model.presenting,
            place: model.place,
          }),
        }),
      },
    },
    Blueprint: { children: { blueprint: Actor.child(Blueprint) } },
    World: {
      children: {
        world: Actor.child(World, {
          props: ({ model }) => ({ fakes: model.fakes }),
        }),
      },
    },
  },
});

export const InspectorView = View.make(Inspector, (self) => (
  <Body
    {...self}
    running={
      self._tag === 'Running' ? (
        <RunningView instance={self.children.running} />
      ) : null
    }
    blueprint={
      self._tag === 'Blueprint' ? (
        <BlueprintView instance={self.children.blueprint} />
      ) : null
    }
    world={
      self._tag === 'World' ? (
        <WorldView instance={self.children.world} />
      ) : null
    }
  />
));
