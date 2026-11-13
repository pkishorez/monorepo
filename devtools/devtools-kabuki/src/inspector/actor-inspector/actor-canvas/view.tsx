import { useMemo } from 'react';
import { View, useChildren } from '@kestack/kabuki/react';
import type { Node } from '../../../api/index.ts';
import { CanvasLive } from './actor.ts';
import { Blueprint } from './ui/blueprint.tsx';
import { Canvas } from './ui/canvas.tsx';

/* The canvas drawn: the graph, each open card with its Card's data; or the Blueprint. */

export const CanvasView = View.make(
  CanvasLive,
  ({ model, props, children, send }) => {
    const read = useChildren(children.card, (card) => card.model.node);
    const cards = useMemo(
      () =>
        new Map(
          read.flatMap((node): ReadonlyArray<readonly [string, Node]> =>
            node ? [[node.id, node]] : [],
          ),
        ),
      [read],
    );
    if (model.problem)
      return (
        <p className="p-6 text-sm text-muted-foreground">{model.problem}</p>
      );
    if (props.blueprint)
      return model.print ? (
        <Blueprint
          root={model.print}
          opened={props.opened}
          onOpen={(id, open) => send({ _tag: 'Opened', id, open })}
        />
      ) : null;
    if (!model.graph) return null;
    return (
      <div className="relative flex min-h-0 flex-1 flex-col">
        <Canvas
          root={model.graph.root}
          opened={props.opened}
          cards={cards}
          frame
          follow={props.follow}
          only={props.only}
          {...(props.bring ? { bring: { ...props.bring, with: [] } } : {})}
          // Presenting, nothing to press.
          {...(props.follow
            ? {}
            : { onTrail: (id: string) => send({ _tag: 'Zoomed', id }) })}
          onOpen={(id, open) => send({ _tag: 'Opened', id, open })}
        />
      </div>
    );
  },
);
