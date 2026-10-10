import type { ComponentType } from 'react';
import { Audio, Sequence, useCurrentFrame } from 'remotion';
import { fps } from '../canvas/index.ts';
import { Stage } from '../stage/index.ts';
import { timelineOf, type Cue, type Voiceover } from './timeline.ts';

// A Scene receives only how long it lasts; everything else it shows is its
// Explainer's own content.
type SceneComponent = ComponentType<{ durationInFrames: number }>;

// A canvas draws the whole Explainer from the global frame, so motion flows
// across Scene boundaries instead of restarting with each one.
type CanvasComponent = ComponentType<{ frame: number; cue: Cue }>;

export function video<Props extends Record<string, unknown>>(
  id: string,
  durationInFrames: number,
  component: ComponentType<Props>,
) {
  return { id, component, durationInFrames, fps, width: 1920, height: 1080 };
}

// Turns an Explainer's voiceover and Scenes into a video.
export function defineExplainer({
  id,
  voiceover,
  scenes,
}: {
  id: string;
  voiceover: Voiceover;
  scenes: Record<string, SceneComponent>;
}) {
  const { timeline, durationInFrames } = timelineOf(voiceover);

  function Explainer() {
    return (
      <Stage>
        {timeline.map(({ id: lineId, from, durationInFrames, src }) => {
          const Scene = scenes[lineId];
          return (
            <Sequence
              key={lineId}
              from={from}
              durationInFrames={durationInFrames}
            >
              {Scene ? <Scene durationInFrames={durationInFrames} /> : null}
              <Audio src={src} />
            </Sequence>
          );
        })}
      </Stage>
    );
  }

  return video(id, durationInFrames, Explainer);
}

// Turns an Explainer's voiceover and one canvas into a video. The narration
// still plays line by line; the picture is one continuous drawing.
export function defineCanvasExplainer({
  id,
  voiceover,
  canvas: Drawing,
}: {
  id: string;
  voiceover: Voiceover;
  canvas: CanvasComponent;
}) {
  const { timeline, cue, durationInFrames } = timelineOf(voiceover);

  function Explainer() {
    const frame = useCurrentFrame();
    return (
      <Stage>
        <Drawing frame={frame} cue={cue} />
        {timeline.map(({ id: lineId, from, durationInFrames, src }) => (
          <Sequence
            key={lineId}
            from={from}
            durationInFrames={durationInFrames}
          >
            <Audio src={src} />
          </Sequence>
        ))}
      </Stage>
    );
  }

  return video(id, durationInFrames, Explainer);
}
