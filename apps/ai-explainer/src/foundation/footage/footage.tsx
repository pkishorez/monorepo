import type { ReactNode } from 'react';
import { Freeze, OffthreadVideo, Sequence } from 'remotion';
import { fps } from '../canvas/index.ts';
import { Sound } from '../sound/index.ts';
import { useStyle } from '../style/index.ts';
import { useClip } from './clip.ts';

// A recorded clip of a live app, framed as a card. It plays from frame `from`
// and must be done by frame `until`: a clip longer than that window plays up
// to twice as fast to fit. Before and after it holds its first and last
// frame. Every recorded click it plays gets a soft click sound.
export function Footage({
  look,
  clip: id,
  frame,
  from,
  until,
  width = 1120,
}: {
  look: string;
  clip: string;
  frame: number;
  from: number;
  until: number;
  width?: number;
}) {
  const { src, clip } = useClip(look, id);
  const span = Math.max(1, until - from);
  const rate = clip ? Math.min(2, Math.max(1, clip.seconds / (span / fps))) : 1;
  const length = clip
    ? Math.min(span, Math.floor((clip.seconds / rate) * fps) - 1)
    : span;
  const held = Math.min(Math.max(frame, from), from + length);
  return (
    <Frame width={width}>
      {src && clip ? (
        <>
          <Freeze frame={held}>
            <Sequence from={from} layout="none">
              <OffthreadVideo
                src={src}
                playbackRate={rate}
                muted
                className="block size-full object-cover"
              />
            </Sequence>
          </Freeze>
          {clip.clicks
            .map((seconds) => (seconds / rate) * fps)
            .filter((at) => at <= length)
            .map((at) => (
              <Sound key={at} name="click" at={from + at} />
            ))}
        </>
      ) : (
        <Placeholder look={look} id={id} progress={(held - from) / length} />
      )}
    </Frame>
  );
}

function Frame({ width, children }: { width: number; children: ReactNode }) {
  return (
    <div
      className="relative overflow-hidden border"
      style={{
        width,
        aspectRatio: '16 / 9',
        borderColor: 'var(--surface-line)',
        borderRadius: 'var(--radius-card)',
        boxShadow: 'var(--surface-shadow)',
        background: 'oklch(0.16 0.02 260)',
      }}
    >
      {children}
    </div>
  );
}

// Stands in for a clip not recorded yet, so a Walkthrough can be built and
// timed before its recordings exist. Its bar shows where playback would be.
function Placeholder({
  look,
  id,
  progress,
}: {
  look: string;
  id: string;
  progress: number;
}) {
  const style = useStyle();
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-[oklch(0.86_0.02_250)]"
      style={{
        fontFamily: style.font.mono,
        backgroundImage:
          'repeating-linear-gradient(135deg, oklch(1 0 0 / 0.035) 0 18px, transparent 18px 36px)',
      }}
    >
      <div className="text-[22px] tracking-[0.2em] uppercase opacity-60">
        Recording missing
      </div>
      <div className="text-[56px] font-semibold">{id}</div>
      <div className="text-[22px] opacity-60">
        public/recordings/{look}/{id}.mp4
      </div>
      <div className="absolute inset-x-0 bottom-0 h-1.5 bg-[oklch(1_0_0/0.08)]">
        <div
          className="h-full bg-[oklch(0.82_0.11_215)]"
          style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }}
        />
      </div>
    </div>
  );
}
