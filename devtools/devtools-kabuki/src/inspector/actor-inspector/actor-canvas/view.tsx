import { useMemo } from 'react';
import { View, useChildren } from '@kestack/kabuki/react';
import type { Node } from '../../../api/index.ts';
import { CanvasLive } from './actor.ts';
import { Canvas } from './ui/canvas.tsx';

/* The canvas drawn: the graph, each open card with its Card's data. */

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
    if (!model.graph) return null;
    return (
      <div className="relative flex min-h-0 flex-1 flex-col">
        <Canvas
          root={model.graph.root}
          opened={props.opened}
          cards={cards}
          frame
          follow={props.follow}
          {...(props.bring ? { bring: { ...props.bring, with: [] } } : {})}
          onOpen={(id, open) => send({ _tag: 'Opened', id, open })}
        />
      </div>
    );
  },
);
