import { useMemo } from 'react';
import type { ActorDefinition } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';
import { hostHistory } from '../inspected.ts';
import { treeOf } from '../read/blueprint.ts';
import { fromPrint } from '../read/graph.ts';
import { learn } from '../read/learned.ts';
import { Canvas } from '../ui/canvas.tsx';
import { Caption } from '../ui/caption.tsx';
import { Timeline } from '../ui/timeline.tsx';
import { StoryLive } from './actor.ts';
import { shellStory } from './scenes.ts';

/*
 * Story's View: code's Blueprint on the canvas, the Scene's Actor open in
 * the Scene's State with its part ringed, and what the Scene says over it.
 * Each Scene opens its Actor's card and brings it to the middle; the
 * reader opens any other beside it.
 */

/** code's own root, the page Start's Router holds; the Story is told from it. */
const appOf = (root: ActorDefinition) =>
  root.children[root.states[0] ?? 'Single']?.['page']?.definition ?? root;

export const StoryView = View.make(
  StoryLive,
  ({ _tag, state, model, send }) => {
    const story = shellStory;
    const history = hostHistory();
    const root = history?.actor.definition;
    const tree = useMemo(
      () => (root ? treeOf(appOf(root)) : undefined),
      [root],
    );
    const scene = story.scenes[state.scene]!;
    const sceneId = scene.path === '' ? '/' : scene.path;
    const graph = useMemo(
      () =>
        tree &&
        history &&
        root &&
        fromPrint(
          tree,
          (path) => (path === scene.path ? (scene.in ?? null) : null),
          learn(history, root),
        ),
      [tree, scene, history, root],
    );

    if (!graph)
      return (
        <p className="p-6 text-sm text-muted-foreground">
          code has not run in this tab yet.
        </p>
      );

    return (
      <>
        <div className="relative flex min-h-0 flex-1 flex-col">
          <Canvas
            root={graph}
            opened={model.opened}
            frame
            bring={{ id: sceneId, key: `scene:${state.scene}` }}
            {...(scene.part
              ? { focus: { card: sceneId, part: scene.part } }
              : {})}
            onOpen={(id, open) => send({ _tag: 'Toggled', id, open })}
          />
          <Caption>
            <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase tabular-nums">
              {state.scene + 1}/{story.scenes.length} · {story.title}
            </p>
            <h2 className="mt-1 text-base font-semibold text-balance">
              {scene.title}
            </h2>
            <p className="mt-1 text-sm leading-6 text-pretty">{scene.say}</p>
          </Caption>
        </div>
        <Timeline
          ticks={story.scenes.map((one, i) => ({
            id: String(i),
            label: one.title,
            tone: 'scene',
          }))}
          at={state.scene}
          onAt={(at) => send({ _tag: 'Chose', scene: at ?? 0 })}
          playing={_tag === 'Playing'}
          onPlaying={(play) => send({ _tag: play ? 'Play' : 'Pause' })}
          caption={
            <p className="truncate text-muted-foreground">
              {scene.part && 'name' in scene.part
                ? scene.part.name
                : scene.title}
            </p>
          }
        />
      </>
    );
  },
);
