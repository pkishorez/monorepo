import { Kind } from '../pen/index.ts';
import type { Cloud, V3 } from '../pen/index.ts';
import {
  ball,
  lattice,
  roundRect,
  segment,
  stroke,
  sub3,
} from '../pen/index.ts';

/*
 * web-platform: one config, an app everywhere. A small config file at the
 * top, and from it a stream into two outlines: a browser window on a desk
 * and a phone in front of it, each showing the same page.
 */

/** Lines of a page, as fractions of the screen: [x, y, width]. */
const PAGE: ReadonlyArray<readonly [number, number, number]> = [
  [0.08, 0.2, 0.5],
  [0.08, 0.33, 0.84],
  [0.08, 0.41, 0.72],
  [0.08, 0.49, 0.8],
  [0.08, 0.57, 0.4],
];

function screen(
  c: Cloud,
  center: V3,
  w: number,
  h: number,
  weight: number,
): void {
  const left = center[0] - w / 2;
  const top = center[1] + h / 2;
  for (const [x, y, len] of PAGE) {
    const from: V3 = [left + x * w, top - y * h, center[2]];
    const to: V3 = [left + (x + len) * w, top - y * h, center[2]];
    stroke(
      c,
      c.n * 0.012 * weight * len,
      segment(from, to),
      y === 0.2 ? 1.1 : 0.5,
    );
  }
  // A picture block at the foot of the page.
  lattice(
    c,
    c.n * 0.03 * weight,
    [center[0], top - 0.8 * h, center[2]],
    w * 0.84,
    h * 0.24,
    0.4,
  );
}

export function web(c: Cloud): void {
  const { n, random } = c;

  // The browser: frame, title bar, its three dots, the page.
  const browser: V3 = [0.24, -0.08, -0.12];
  const bw = 1.12;
  const bh = 0.74;
  stroke(c, n * 0.11, roundRect(browser, bw, bh, 0.04), 1);
  const bar = browser[1] + bh / 2 - 0.08;
  stroke(
    c,
    n * 0.035,
    segment(
      [browser[0] - bw / 2, bar, browser[2]],
      [browser[0] + bw / 2, bar, browser[2]],
    ),
    0.6,
  );
  for (let k = 0; k < 3; k++) {
    ball(
      c,
      n * 0.003,
      [browser[0] - bw / 2 + 0.05 + k * 0.035, bar + 0.04, browser[2]],
      0.009,
      1.6,
    );
  }
  screen(c, [browser[0], browser[1] - 0.04, browser[2]], bw, bh - 0.08, 1.4);

  // The phone, in front: frame, its notch, the same page, narrower.
  const phone: V3 = [-0.64, -0.2, 0.22];
  const pw = 0.34;
  const ph = 0.68;
  stroke(c, n * 0.07, roundRect(phone, pw, ph, 0.06), 1.1);
  stroke(
    c,
    n * 0.004,
    segment(
      [phone[0] - 0.04, phone[1] + ph / 2 - 0.035, phone[2]],
      [phone[0] + 0.04, phone[1] + ph / 2 - 0.035, phone[2]],
    ),
    1.4,
  );
  screen(c, [phone[0], phone[1] - 0.02, phone[2]], pw * 0.86, ph - 0.12, 0.6);

  // The config: a small card with a folded corner and a few lines.
  const config: V3 = [-0.14, 0.72, 0.05];
  stroke(c, n * 0.03, roundRect(config, 0.22, 0.26, 0.02), 1.2);
  for (let k = 0; k < 4; k++) {
    const y = config[1] + 0.07 - k * 0.045;
    const x = config[0] - 0.07 + (k % 2) * 0.025;
    stroke(
      c,
      n * 0.003,
      segment([x, y, config[2]], [x + 0.1 - (k % 2) * 0.03, y, config[2]]),
      0.9,
    );
  }

  // From it, a stream to each.
  const from: V3 = [config[0], config[1] - 0.14, config[2]];
  const targets: V3[] = [
    [browser[0] - 0.1, browser[1] + bh / 2 + 0.02, browser[2]],
    [phone[0], phone[1] + ph / 2 + 0.02, phone[2]],
  ];
  for (let k = 0; k < n * 0.012; k++) {
    const to = targets[k % 2]!;
    c.add(from, 1.2, [Kind.flow, random(), ...sub3(to, from)]);
  }
}
