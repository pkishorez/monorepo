import { ease, mix } from '../canvas/index.ts';
import { hue, useStyle } from '../style/index.ts';

// The name of the idea a chapter adds, written on the board above its region,
// with the chapter's number.
export function ChapterLabel({
  chapter,
  title,
  frame,
  enter,
}: {
  chapter: number;
  title: string;
  frame: number;
  enter: number;
}) {
  const style = useStyle();
  const t = ease(frame, enter, 0.7);
  const number = String(chapter).padStart(2, '0');
  const color = hue(style, chapter - 1);
  const shift = { transform: `translateY(${mix(14, 0, t)}px)`, opacity: t };

  if (style.name === 'bold') {
    return (
      <div className="flex items-center gap-7" style={shift}>
        <div
          className="flex size-[120px] items-center justify-center rounded-[22px] text-[64px] font-[800] text-white tabular-nums"
          style={{ background: color }}
        >
          {number}
        </div>
        <div
          className="text-[124px] leading-none font-[820] tracking-[-0.05em] whitespace-nowrap"
          style={{ color }}
        >
          {title}
        </div>
      </div>
    );
  }
  if (style.name === 'blueprint') {
    return (
      <div
        className="flex flex-col gap-4"
        style={{ ...shift, fontFamily: style.font.label }}
      >
        <div
          className="flex items-center gap-4 text-[24px] tracking-[0.2em] uppercase"
          style={{ color }}
        >
          <span>Ch {number}</span>
          <span
            className="h-px w-24"
            style={{ background: color, opacity: 0.6 }}
          />
        </div>
        <div className="text-[76px] leading-none font-medium tracking-[-0.02em] whitespace-nowrap">
          {title}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-baseline gap-6" style={shift}>
      <span
        className="text-[40px] font-medium tabular-nums"
        style={{ color: 'var(--muted-foreground)' }}
      >
        {number}
      </span>
      <span className="text-[84px] leading-none font-semibold tracking-[-0.03em] whitespace-nowrap">
        {title}
      </span>
    </div>
  );
}
