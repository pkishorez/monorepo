import type { ComponentType } from 'react';
import { Audio, Sequence } from 'remotion';
import { Stage } from '../stage/index.ts';

const fps = 24;

type Voiceover = {
  lines: readonly { id: string; seconds: number; src: string }[];
};

// A Scene receives only how long it lasts; everything else it shows is its
// Explainer's own content.
type SceneComponent = ComponentType<{ durationInFrames: number }>;

// Turns an Explainer's voiceover and Scenes into a video: each Scene lasts as
// long as its narration line, so timing always follows the voice.
export function defineExplainer({
  id,
  voiceover,
  scenes,
}: {
  id: string;
  voiceover: Voiceover;
  scenes: Record<string, SceneComponent>;
}) {
  let from = 0;
  const timeline = voiceover.lines.map((line) => {
    const durationInFrames = Math.ceil(line.seconds * fps);
    const entry = { ...line, from, durationInFrames, Scene: scenes[line.id] };
    from += durationInFrames;
    return entry;
  });

  function Explainer() {
    return (
      <Stage>
        {timeline.map(({ id: lineId, from, durationInFrames, src, Scene }) => (
          <Sequence
            key={lineId}
            from={from}
            durationInFrames={durationInFrames}
          >
            {Scene ? <Scene durationInFrames={durationInFrames} /> : null}
            <Audio src={src} />
          </Sequence>
        ))}
      </Stage>
    );
  }

  return {
    id,
    component: Explainer,
    durationInFrames: Math.max(from, 1),
    fps,
    width: 1920,
    height: 1080,
  };
}
