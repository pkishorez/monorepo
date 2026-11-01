import { Kind, gathered, line } from '../pen/index.ts';
import type { Cloud, Label, Motion, V3 } from '../pen/index.ts';
import { WAIT, message, node, sec } from './beats.ts';

/*
 * compose: Actors made of Actors. App holds Session, Cart and Search, each
 * a point joined to it by a hairline; Cart holds two Items for as long as
 * it lives. Four chains a loop. A Message runs down to Search, Search
 * pops, and its Results pop into being beneath it: it is Searching. One
 * runs to Session, which pops, while the search goes on. Another ends the
 * search: Search pops, the Results scatter. Then one runs to Cart, Cart
 * pops, and both its Items answer, one after the other.
 */

const ROWS = [0.55, 0, -0.55];
const APP: V3 = [0, ROWS[0]!, 0];
const SESSION: V3 = [-0.62, ROWS[1]!, 0];
const CART: V3 = [0, ROWS[1]!, 0];
const SEARCH: V3 = [0.62, ROWS[1]!, 0];
const ITEMS: V3[] = [
  [-0.2, ROWS[2]!, 0],
  [0.2, ROWS[2]!, 0],
];
const RESULTS: V3 = [0.62, ROWS[2]!, 0];

/** When each Message leaves App, in seconds, and how long it runs. */
const TO_SEARCH = [0.3, 4.8];
const TO_SESSION = 2.6;
const TO_CART = 6.6;
const FLIGHT = 0.65;
const lands = (at: number) => at + WAIT + FLIGHT;
/** While Search is Searching, and its Results exist. */
const SEARCHING = {
  from: lands(TO_SEARCH[0]!) + 0.08,
  until: lands(TO_SEARCH[1]!) + 0.04,
} as const;

/** How far short of a node an edge stops. */
const GAP = 0.06;

function edge(c: Cloud, a: V3, b: V3, motion?: Motion): void {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  const [ux, uy] = [dx / len, dy / len];
  line(
    c,
    [a[0] + ux * GAP, a[1] + uy * GAP, 0],
    [b[0] - ux * GAP, b[1] - uy * GAP, 0],
    0.3,
    motion && (() => motion),
  );
}

const between = (a: V3, b: V3) => [b[0] - a[0], b[1] - a[1]] as const;

export function compose(c: Cloud): void {
  node(c, APP, 1.4);
  node(c, SESSION, 1, { at: lands(TO_SESSION) });
  node(c, SEARCH, 1, { at: lands(TO_SEARCH[0]!), repeats: 2 });
  node(c, CART, 1, { at: lands(TO_CART) });
  for (const kid of [SESSION, CART, SEARCH]) edge(c, APP, kid);
  ITEMS.forEach((item, k) => {
    node(c, item, 0.8, { at: lands(TO_CART) + 0.12 + k * 0.08 });
    edge(c, CART, item);
  });

  for (const at of TO_SEARCH)
    message(c, APP, between(APP, SEARCH), at, FLIGHT, Kind.glide);
  message(c, APP, between(APP, SESSION), TO_SESSION, FLIGHT, Kind.glide);
  message(c, APP, between(APP, CART), TO_CART, FLIGHT, Kind.glide);

  // Results, only while Searching.
  const formed: Motion = [
    Kind.gather,
    sec(SEARCHING.from),
    sec(SEARCHING.until - SEARCHING.from),
    0.25,
    0,
  ];
  node(c, RESULTS, 0.8, undefined, formed);
  edge(c, SEARCH, RESULTS, formed);
}

export const composeLabels: readonly Label[] = [
  { text: 'App', at: [APP[0], APP[1] + 0.12, 0] },
  { text: 'Cart', at: [CART[0] + 0.14, CART[1], 0] },
  { text: 'Search', at: [SEARCH[0] + 0.17, SEARCH[1], 0] },
  { text: 'Session', at: [SESSION[0] - 0.18, SESSION[1], 0] },
  {
    text: 'Results',
    at: [RESULTS[0], RESULTS[1] - 0.12, 0],
    show: (clock) =>
      gathered(
        clock,
        sec(SEARCHING.from),
        sec(SEARCHING.until - SEARCHING.from),
      ),
  },
];
