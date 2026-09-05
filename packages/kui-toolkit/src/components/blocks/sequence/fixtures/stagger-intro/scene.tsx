import { Div, Present, enter, loop, stagger } from '../../index';

import { introHues } from './model';

/** Props for a single stagger-intro frame. */
export type IntroProps = {
  title: string;
  boxes: number;
  pulse: boolean;
};

/**
 * Render function for one stagger-intro frame: a layoutId-morphing title above a
 * staggered row of gradient boxes. The final frame swaps the staggered entry for
 * a decorative infinite float (the sanctioned loop exception to presets).
 */
export const introScene = ({ title, boxes, pulse }: IntroProps) => (
  <div className="flex flex-col items-center gap-[calc(2.9*var(--u))]">
    <div className="relative flex h-[calc(2.9*var(--u))] items-center justify-center">
      <Present
        swapKey={title}
        layout
        layoutId="intro-title"
        enter="fade"
        exit="fade"
        className="absolute whitespace-nowrap bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-[calc(2.2*var(--u))] font-semibold tracking-tight"
      >
        {title}
      </Present>
    </div>
    <div className="flex gap-[calc(1.5*var(--u))]">
      {Array.from({ length: boxes }, (_, i) => (
        <Div
          key={i}
          initial={enter.rise.initial}
          animate={
            pulse
              ? { opacity: 1, scale: [1, 1.16, 1], y: [0, -14, 0] }
              : enter.rise.animate
          }
          transition={pulse ? loop(1.4, stagger(i, 0.12)) : { ...stagger(i) }}
          className={`size-[calc(5.9*var(--u))] rounded-[calc(1.5*var(--u))] bg-gradient-to-br ${introHues[i % introHues.length]} shadow-lg`}
        />
      ))}
    </div>
  </div>
);
