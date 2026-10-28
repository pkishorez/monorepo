import { Kind, arrow, ball, bend, box, line, ring } from '../pen/index.ts';
import type { Cloud, Label, V3 } from '../pen/index.ts';

/*
 * actor: the building block. On the left a View, a small card with a
 * counter, `− 3 +`; on the right the Actor, holding its Model. Over the top
 * a Message travels from the View to the Actor; underneath, the Actor's
 * update comes back and the View draws it. Pulses only ever run the way the
 * arrows point.
 */

const VIEW: V3 = [-0.56, 0, 0];
const ACTOR: V3 = [0.56, 0, 0];
const W = 0.5;
const H = 0.46;

export function actor(c: Cloud): void {
  const { n } = c;

  // The View: a card, a title bar, the counter's two buttons.
  box(c, VIEW, W, H, 0.05);
  line(
    c,
    [VIEW[0] - W / 2 + 0.04, VIEW[1] + 0.13, 0],
    [VIEW[0] + W / 2 - 0.04, VIEW[1] + 0.13, 0],
    0.35,
  );
  for (const dx of [-0.15, 0.15]) {
    const at: V3 = [VIEW[0] + dx, VIEW[1] - 0.04, 0];
    box(c, at, 0.1, 0.1, 0.025, 0.7);
    line(c, [at[0] - 0.025, at[1], 0], [at[0] + 0.025, at[1], 0], 1.1);
    if (dx > 0)
      line(c, [at[0], at[1] - 0.025, 0], [at[0], at[1] + 0.025, 0], 1.1);
  }

  // The Actor: a box, and in it the Model, a ring round a bright heart.
  box(c, ACTOR, W, H, 0.08, 1);
  ring(c, [ACTOR[0], ACTOR[1] + 0.03, 0], 0.07, 0.8);
  ball(c, n * 0.004, [ACTOR[0], ACTOR[1] + 0.03, 0], 0.018, 1.6);

  // The Message over the top, the update back underneath.
  const gap = W / 2 + 0.04;
  const over = bend(
    [VIEW[0] + gap, 0.1, 0],
    [0, 0.3, 0],
    [ACTOR[0] - gap, 0.1, 0],
  );
  const under = bend(
    [ACTOR[0] - gap, -0.1, 0],
    [0, -0.3, 0],
    [VIEW[0] + gap, -0.1, 0],
  );
  arrow(c, over, 0.5, 0.55, (u) => [Kind.pulse, 0, u, 0.45, 0.07]);
  arrow(c, under, 0.5, 0.55, (u) => [Kind.pulse, 0.5, u, 0.45, 0.07]);
}

export const actorLabels: readonly Label[] = [
  { text: 'View', at: [VIEW[0], H / 2 + 0.09, 0] },
  { text: 'Actor', at: [ACTOR[0], H / 2 + 0.09, 0] },
  { text: 'Increment', kind: 'message', at: [0, 0.34, 0] },
  { text: 'Model { count: 3 }', at: [ACTOR[0], -H / 2 - 0.15, 0] },
  { text: '3', at: [VIEW[0], -0.04, 0] },
  { text: 'draws', kind: 'note', at: [0, -0.33, 0] },
];
