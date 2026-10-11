import { Audio, Sequence } from 'remotion';
import { fps } from '../canvas/index.ts';
import { video, type Voiceover } from '../explainer/index.ts';
import { Footage } from '../footage/index.ts';
import { Music, Sound } from '../sound/index.ts';
import { Stage } from '../stage/index.ts';
import type { Stage as TakeStage } from './stage.ts';
import { timingOf, type Beat, type Take } from './timing.ts';

// The music carries the opening title and the close, and is gone while the
// narrator teaches.
const OPEN = 0.5;

// Turns a Walkthrough into a video: one recording of the whole build-up,
// with every line spoken at its beat, music for the opening and the close,
// and a chime on the last beat.
export function defineWalkthrough({
  id,
  beats,
  voiceover,
  takes,
}: {
  id: string;
  beats: ReadonlyArray<Beat>;
  voiceover: Voiceover;
  takes: Readonly<Record<string, Take<TakeStage>>>;
}) {
  const { beats: timed, seconds } = timingOf(beats, voiceover.lines, takes);
  const durationInFrames = Math.ceil(seconds * fps);
  const firstLine = timed.find((beat) => beat.speak !== null)!.speak! * fps;
  const close = timed.at(-1)!;
  const closeFrom = close.start * fps;

  // Full under the title, gone a second before the first line, and back for the close.
  const level = (frame: number) => {
    if (frame < firstLine)
      return (
        OPEN * Math.min(1, Math.max(0, (firstLine - fps - frame) / (2 * fps)))
      );
    return OPEN * Math.min(1, Math.max(0, (frame - closeFrom) / (2 * fps)));
  };

  function Walkthrough() {
    return (
      <Stage>
        <Footage id={id} durationInFrames={durationInFrames} />
        {timed.map(({ id: lineId, speak }) => {
          const line = voiceover.lines.find((each) => each.id === lineId);
          if (!line || speak === null) return null;
          return (
            <Sequence
              key={lineId}
              from={Math.round(speak * fps)}
              durationInFrames={Math.ceil(line.seconds * fps)}
              layout="none"
            >
              <Audio src={line.src} />
            </Sequence>
          );
        })}
        <Music durationInFrames={durationInFrames} level={level} />
        <Sound
          name="chime"
          at={(close.speak ?? close.start) * fps + 1.2 * fps}
        />
      </Stage>
    );
  }

  return video(id, durationInFrames, Walkthrough);
}
