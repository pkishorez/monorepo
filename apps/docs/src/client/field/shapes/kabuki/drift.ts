import { Kind } from '../pen/index.ts';
import type { Cloud, V3 } from '../pen/index.ts';

/*
 * drift: the quiet before kabuki's first idea. Faint motes scattered wide
 * across the whole screen, each drifting slowly and fading in and out.
 * Each mote is a few points on top of one another, so the field reads
 * sparse however many points it has.
 */

const PER_MOTE = 14;

export function drift(c: Cloud): void {
  const { n, random } = c;
  for (let m = 0; m < n / PER_MOTE; m++) {
    const at: V3 = [
      (random() * 2 - 1) * 2.7,
      (random() * 2 - 1) * 1.5,
      (random() * 2 - 1) * 0.7,
    ];
    const way: V3 = [0.18 + random() * 0.22, (random() - 0.4) * 0.12, 0];
    const phase = random();
    const bright = 0.12 + random() * random() * 0.3;
    for (let k = 0; k < PER_MOTE; k++) {
      c.add(
        [
          at[0] + (random() - 0.5) * 0.006,
          at[1] + (random() - 0.5) * 0.006,
          at[2],
        ],
        bright,
        [Kind.flow, phase, ...way],
      );
    }
  }
}
