import type { ComponentType } from 'react';
import { Audio, Sequence, useCurrentFrame } from 'remotion';
import { fps } from '../canvas/index.ts';
import { Stage } from '../stage/index.ts';

type Voiceover = {
  lines: readonly { id: string; seconds: number; src: string; text: string }[];
};

// A Scene receives only how long it lasts; everything else it shows is its
// Explainer's own content.
type SceneComponent = ComponentType<{ durationInFrames: number }>;

// The frame at which the narrator reaches `word` in Scene `id`, estimated from
// its position in the line, plus an optional delay in seconds.
export type Cue = (id: string, word?: string, delay?: number) => number;

// A canvas draws the whole Explainer from the global frame, so motion flows
// across Scene boundaries instead of restarting with each one.
type CanvasComponent = ComponentType<{ frame: number; cue: Cue }>;

// Each Scene lasts as long as its narration line, so timing always follows
// the voice.
function timelineOf(voiceover: Voiceover) {
  let from = 0;
  const timeline = voiceover.lines.map((line) => {
    const durationInFrames = Math.ceil(line.seconds * fps);
    const entry = { ...line, from, durationInFrames };
    from += durationInFrames;
    return entry;
  });
  const cue: Cue = (id, word, delay = 0) => {
    const line = timeline.find((entry) => entry.id === id);
    if (!line) throw new Error(`No Scene "${id}"`);
    const index = word ? line.text.indexOf(word) : 0;
    if (index < 0) throw new Error(`"${word}" is not in Scene "${id}"`);
    return (
      line.from +
      (index / line.text.length) * line.durationInFrames +
      delay * fps
    );
  };
  return { timeline, cue, durationInFrames: Math.max(from, 1) };
}

function video(id: string, durationInFrames: number, component: ComponentType) {
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
