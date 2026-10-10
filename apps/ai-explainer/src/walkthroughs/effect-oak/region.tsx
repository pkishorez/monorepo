import type { ReactNode } from 'react';
import { ChapterLabel } from '../../foundation/cards/index.ts';
import { ease, fps, glide } from '../../foundation/canvas/index.ts';
import {
  CodeCard,
  type CodeStep,
  type Problem,
} from '../../foundation/code/index.ts';
import { Footage } from '../../foundation/footage/index.ts';

// Where each chapter's parts sit around its region's centre, in world units.
export const layout = {
  code: { x: -1100, y: -430, width: 960, rows: 24 },
  label: { x: -1100, y: -610 },
  clip: { x: -20, y: -315, width: 1120 },
  wide: { x: -800, y: -330, width: 1600 },
};

export type Point = { x: number; y: number };

export type Card = {
  at: number;
  title: string;
  code: string;
  lang?: 'tsx' | 'typescript';
  steps?: CodeStep[];
  rows?: number;
  problem?: Problem;
};

export type Clip = { id: string; from: number; until: number; at?: number };

// Places a child by its top-left corner on a world point.
export function Place({
  at,
  opacity = 1,
  children,
}: {
  at: Point;
  opacity?: number;
  children: ReactNode;
}) {
  return (
    <div className="absolute" style={{ left: at.x, top: at.y, opacity }}>
      {children}
    </div>
  );
}

// Things shown in turn in one place, each from its `at` until the next one's:
// the old one fades out just before, the new one fades in just after, so two
// never blur into each other.
export const turn = (frame: number, ats: number[], i: number) =>
  ease(frame, ats[i]!, 0.35) *
  (i + 1 < ats.length
    ? 1 - ease(frame, ats[i + 1]! - 0.2 * fps, 0.2, glide)
    : 1);

// One chapter: its label, its code cards shown in turn, and its recorded
// clips shown in turn. A chapter without code gets one wide clip.
export function Region({
  at: centre,
  chapter,
  title,
  enter,
  frame,
  look,
  cards = [],
  clips,
}: {
  at: Point;
  chapter: number;
  title: string;
  enter: number;
  frame: number;
  look: string;
  cards?: Card[];
  clips: Clip[];
}) {
  const shown = ease(frame, enter, 0.6);
  const wide = cards.length === 0;
  const clipBox = wide ? layout.wide : layout.clip;
  const point = (offset: Point) => ({
    x: centre.x + offset.x,
    y: centre.y + offset.y,
  });
  const cardAts = cards.map((card) => card.at);
  const clipAts = clips.map((clip) => clip.at ?? enter);
  return (
    <div style={{ opacity: shown }}>
      <Place at={point(wide ? { x: layout.wide.x, y: -510 } : layout.label)}>
        <ChapterLabel
          chapter={chapter}
          title={title}
          frame={frame}
          enter={enter + 0.15 * fps}
        />
      </Place>
      {cards.map((card, i) => (
        <Place
          key={i}
          at={point(layout.code)}
          opacity={turn(frame, cardAts, i)}
        >
          <CodeCard
            title={card.title}
            code={card.code}
            lang={card.lang}
            frame={frame}
            steps={card.steps}
            rows={card.rows ?? layout.code.rows}
            width={layout.code.width}
            problem={card.problem}
          />
        </Place>
      ))}
      {clips.map((clip, i) => (
        <Place
          key={clip.id}
          at={point(clipBox)}
          opacity={clips.length > 1 ? turn(frame, clipAts, i) : 1}
        >
          <Footage
            look={look}
            clip={clip.id}
            frame={frame}
            from={clip.from}
            until={clip.until}
            width={clipBox.width}
          />
        </Place>
      ))}
    </div>
  );
}
