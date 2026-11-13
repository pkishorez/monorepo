import type { GraphNode } from '../../../../api/index.ts';
import { Canvas } from './canvas.tsx';

/*
 * The Blueprint on the canvas: every Actor the app's root can grow, read
 * from the definitions, whether it runs or not. The whole tree is shown,
 * nothing folded and nothing dimmed. A card pressed opens, and its close
 * button closes it; a card right clicked opens too, and comes to the middle.
 */

export function Blueprint({
  root,
  opened,
  onOpen,
}: {
  readonly root: GraphNode;
  /** The cards open, as many as the reader opened. */
  readonly opened: ReadonlyArray<string>;
  readonly onOpen: (id: string, open: boolean) => void;
}) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <Canvas
        root={root}
        opened={opened}
        cards={new Map()}
        frame
        unfold={() => true}
        folding={false}
        onOpen={onOpen}
      />
    </div>
  );
}
