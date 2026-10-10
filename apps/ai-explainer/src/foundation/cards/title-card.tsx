import { AbsoluteFill } from 'remotion';
import { ease, glide, mix } from '../canvas/index.ts';
import { hue, useStyle } from '../style/index.ts';

// A full-frame card over the board: the opening title, a section break or
// the end card. It settles in at `enter` and glides away at `exit`; `scrim`
// is how much of the board it covers, from 0 to 1.
export function TitleCard({
  eyebrow,
  title,
  detail,
  frame,
  enter,
  exit = Infinity,
  scrim = 1,
}: {
  eyebrow?: string;
  title: string;
  detail?: string;
  frame: number;
  enter: number;
  exit?: number;
  scrim?: number;
}) {
  const style = useStyle();
  const shown = ease(frame, enter, 0.8) * (1 - ease(frame, exit, 0.6, glide));
  if (shown === 0) return null;
  const lift = mix(18, 0, ease(frame, enter, 0.9));
  const accent = hue(style, 0);
  const bold = style.name === 'bold';
  const blueprint = style.name === 'blueprint';
  return (
    <AbsoluteFill className="items-center justify-center">
      <AbsoluteFill
        className="bg-background"
        style={{ opacity: shown * scrim }}
      />
      <div
        className="relative flex flex-col items-center gap-7 text-center"
        style={{ opacity: shown, transform: `translateY(${lift}px)` }}
      >
        {eyebrow && (
          <div
            className="text-[26px] font-medium tracking-[0.18em] uppercase"
            style={{
              fontFamily: style.font.label,
              color: bold ? accent : 'var(--muted-foreground)',
            }}
          >
            {eyebrow}
          </div>
        )}
        <h1
          className="leading-none"
          style={{
            fontFamily: style.font.label,
            fontSize: bold ? 220 : blueprint ? 150 : 160,
            fontWeight: bold ? 820 : blueprint ? 500 : 640,
            letterSpacing: bold
              ? '-0.055em'
              : blueprint
                ? '-0.02em'
                : '-0.035em',
            color: bold ? 'var(--foreground)' : undefined,
          }}
        >
          {title}
        </h1>
        {blueprint && (
          <div
            className="h-px w-[520px]"
            style={{ background: accent, opacity: 0.6 }}
          />
        )}
        {detail && (
          <div
            className="text-[32px]"
            style={{
              fontFamily: style.font.mono,
              color: bold ? accent : 'var(--muted-foreground)',
            }}
          >
            {detail}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
}
