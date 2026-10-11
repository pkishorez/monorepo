import { AbsoluteFill, OffthreadVideo, useCurrentFrame } from 'remotion';
import { fps } from '../canvas/index.ts';
import { Sound } from '../sound/index.ts';
import { useClip } from './clip.ts';

// A recording of a live app filling the whole frame, played as recorded,
// with a soft click for every click of the cursor in it.
export function Footage({
  id,
  durationInFrames,
}: {
  id: string;
  durationInFrames: number;
}) {
  const { src, clip } = useClip(id);
  if (!src || !clip)
    return <Placeholder id={id} durationInFrames={durationInFrames} />;
  return (
    <>
      <OffthreadVideo src={src} muted className="absolute inset-0 size-full" />
      {clip.clicks.map((seconds) => (
        <Sound key={seconds} name="click" at={seconds * fps} />
      ))}
    </>
  );
}

// Stands in until the recording exists, so the video can be timed first.
function Placeholder({
  id,
  durationInFrames,
}: {
  id: string;
  durationInFrames: number;
}) {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill className="items-center justify-center gap-4 font-mono">
      <div className="text-[22px] tracking-[0.2em] uppercase opacity-60">
        Recording missing
      </div>
      <div className="text-[22px] opacity-60">public/recordings/{id}.mp4</div>
      <div className="absolute inset-x-0 bottom-0 h-1.5 bg-foreground/10">
        <div
          className="h-full bg-foreground/60"
          style={{ width: `${(frame / durationInFrames) * 100}%` }}
        />
      </div>
    </AbsoluteFill>
  );
}
