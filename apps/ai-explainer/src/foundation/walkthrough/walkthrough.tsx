import type { ComponentType } from 'react';
import { Audio, Sequence, useCurrentFrame } from 'remotion';
import { Captions } from '../captions/index.ts';
import { Canvas, camera, fps, type CameraKey } from '../canvas/index.ts';
import {
  timelineOf,
  video,
  type Cue,
  type Voiceover,
} from '../explainer/index.ts';
import { Music, Sound, type SoundName } from '../sound/index.ts';
import { Stage } from '../stage/index.ts';
import { StyleProvider, styles, type StyleName } from '../style/index.ts';

// A camera key. `quiet` keeps its move from making a whoosh; `punch` lets the
// Style push it in harder.
export type Move = CameraKey & { quiet?: boolean; punch?: boolean };

export type Cues = { name: SoundName; at: number; volume?: number }[];

// What a Walkthrough's drawing gets: the frame, when the narrator says what,
// and which recordings to show.
export type DrawingProps = { frame: number; cue: Cue; look: string };

type Props = { style: StyleName; look: string };

// The louder the move, the farther it travels: across the board, or deep in.
function whooshOf(previous: Move, move: Move) {
  const scale = Math.min(previous.scale, move.scale);
  const across = Math.hypot(move.x - previous.x, move.y - previous.y) * scale;
  const zoom = Math.abs(Math.log(move.scale / previous.scale)) * 1400;
  return Math.min(1, Math.max(0.3, (across + zoom) / 1800));
}

// Turns a Walkthrough's voiceover, camera path and one canvas into a video
// per Style. Narration plays line by line with `pauses` of silence before
// lines; captions, the music bed and a whoosh on every camera move come
// with it. `sounds` adds the Walkthrough's own cues.
export function defineWalkthrough({
  id,
  voiceover,
  pauses,
  tail,
  look,
  path,
  sounds = () => [],
  canvas: Drawing,
  overlay: Overlay,
}: {
  id: string;
  voiceover: Voiceover;
  pauses?: Record<string, number>;
  tail?: number;
  look: string;
  path: (cue: Cue) => Move[];
  sounds?: (cue: Cue) => Cues;
  canvas: ComponentType<DrawingProps>;
  overlay?: ComponentType<DrawingProps>;
}) {
  const { timeline, cue, durationInFrames } = timelineOf(voiceover, {
    pauses,
    tail,
  });
  const moves = path(cue);
  const cues: Cues = [
    ...moves.slice(1).flatMap((move, i) =>
      move.quiet || (move.seconds ?? 1) < 0.3
        ? []
        : [
            {
              name: 'whoosh' as const,
              at: move.at - 0.12 * fps,
              volume: whooshOf(moves[i]!, move),
            },
          ],
    ),
    ...sounds(cue),
  ];
  const ramp = 0.5 * fps;
  const speaking = (frame: number) =>
    Math.max(
      0,
      ...timeline.map(({ from, durationInFrames: length }) =>
        Math.min(
          1,
          (frame - (from - ramp)) / ramp,
          (from + length + ramp - frame) / ramp,
        ),
      ),
    );

  function Walkthrough({ style: name, look }: Props) {
    const frame = useCurrentFrame();
    const { pace } = styles[name];
    const shot = camera(
      frame,
      moves.map((move) => ({
        ...move,
        seconds: (move.seconds ?? 1) * pace.seconds,
        scale: move.punch ? move.scale * pace.punch : move.scale,
      })),
      pace.easing,
    );
    const drawing = { frame, cue, look };
    return (
      <Stage>
        <StyleProvider name={name}>
          <Canvas shot={shot}>
            <Drawing {...drawing} />
          </Canvas>
          {Overlay && <Overlay {...drawing} />}
          <Captions timeline={timeline} frame={frame} />
        </StyleProvider>
        {timeline.map(({ id: lineId, from, durationInFrames: length, src }) => (
          <Sequence
            key={lineId}
            from={from}
            durationInFrames={length}
            layout="none"
          >
            <Audio src={src} />
          </Sequence>
        ))}
        <Music durationInFrames={durationInFrames} speaking={speaking} />
        {cues.map((sound, i) => (
          <Sound key={i} {...sound} />
        ))}
      </Stage>
    );
  }

  return (Object.keys(styles) as StyleName[]).map((style) => ({
    ...video<Props>(`${id}-${style}`, durationInFrames, Walkthrough),
    defaultProps: { style, look },
  }));
}
