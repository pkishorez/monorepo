import type { Instance } from 'effect-oak';
import type { Status, Unit, Group, WorkerUnit } from './units.ts';

/*
 * Units laid out top-down: each parent centred over its Children, the root at
 * x 0 for good. Each Unit is an Actor circle, or a keyed stack; each Group a
 * State pill, with nothing under it when it Invokes nothing. An owner's
 * Workers are not drawn until opened: closed, a badge on the owner counts
 * the keys expected; open, the owner's node grows into a card listing them,
 * one row per Worker, and everything the owner hangs moves down to make
 * room. A node's x and y are its centre, closed or open; the root's never
 * move, so its card grows around them. Pure.
 */

/** How an owner's Workers are summed up on its node; `undefined` when it owns none. */
export interface Badge {
  /** How many keys are expected to run after the Step. */
  readonly count: number;
  /** Started where a Worker started, stopped where one stopped, dim with no keys. */
  readonly status: Status;
  readonly open: boolean;
}

/** An owner's Workers, opened: the card its node grows into, one row per Worker, its keys as pills. */
export interface Card {
  readonly width: number;
  readonly height: number;
  readonly workers: ReadonlyArray<WorkerUnit>;
  /** The Instance the Workers belong to, to read what they are doing live. */
  readonly instance: string | undefined;
}

export interface ActorNode {
  readonly kind: 'actor';
  readonly id: string;
  /** The centre of its circle, or of its card when open. */
  readonly x: number;
  readonly y: number;
  /** How wide its circle and label are, closed. */
  readonly width: number;
  readonly actor: string;
  /** The Instance here at this Step, or the one that just stopped. */
  readonly instance: Instance | undefined;
  readonly status: Status;
  readonly workers: Badge | undefined;
  /** Its Workers, when open. */
  readonly card: Card | undefined;
}

export interface ManyNode {
  readonly kind: 'many';
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly actor: string;
  readonly count: number;
  readonly open: boolean;
  readonly status: Status;
}

export interface StateNode {
  readonly kind: 'state';
  readonly id: string;
  /** The centre of its pill, or of its card when open. */
  readonly x: number;
  readonly y: number;
  /** How wide its pill is, closed. */
  readonly width: number;
  readonly tag: string;
  readonly status: Status;
  readonly workers: Badge | undefined;
  /** Its Workers, when open. */
  readonly card: Card | undefined;
}

export type GraphNode = ActorNode | ManyNode | StateNode;

export interface Edge {
  readonly id: string;
  readonly d: string;
  readonly status: Status;
}

export interface Laid {
  readonly nodes: ReadonlyArray<GraphNode>;
  readonly edges: ReadonlyArray<Edge>;
  /** Which node each Instance is drawn as, by Instance ID. */
  readonly at: ReadonlyMap<string, string>;
  /** How wide the map is, centred on the root at x 0. */
  readonly width: number;
  /** How far above y 0 the map reaches, 0 or less: the root's open card grows up as well as down. */
  readonly top: number;
  readonly height: number;
}

export const CIRCLE = 36;
const LABEL = 30;
const PILL = 24;
const GAP = 28;
const TO_STATE = 92;
const TO_CHILD = 88;
const PAD = 32;

/** A card's measures, shared with how it is drawn: a header, then one row per Worker, its pills wrapping. */
export const CARD = {
  /** As wide as a card gets; pills wrap past it. */
  max: 320,
  min: 150,
  pad: 8,
  radius: 10,
  /** The header row: the owner's name, or tag, and its badge. */
  head: 24,
  /** The small letter circle leading an Actor card's header. */
  mark: 20,
  /** One line of a row: a pill and the space under it. */
  line: 20,
  /** Room under the rows, so an estimate a little short never hides a pill. */
  slack: 6,
  /** A row's lead: its name in mono, its kind, and the gaps before its pills. */
  lead: (worker: WorkerUnit) =>
    textWidth(worker.name, 6.2) + textWidth(worker.kind, 5) + 16,
  /** A pill: its label in mono, its padding and border, and room for the live dot. */
  pill: (label: string) => textWidth(label, 6.2) + 28,
  /** How much of a key is shown on its pill. */
  short: (key: string) => (key.length > 8 ? `${key.slice(0, 7)}…` : key),
} as const;

const BADGE = 18;

const textWidth = (text: string, perChar: number) => text.length * perChar;
const pillWidth = (tag: string) => textWidth(tag, 6.6) + 22;
const labelWidth = (unit: Unit) =>
  Math.max(
    CIRCLE,
    textWidth(unit.actor, 7) + (unit.many ? 40 : 12),
    unit.instance?.key === undefined
      ? 0
      : textWidth(unit.instance.key, 6.6) + 12,
  );

/** What a pill of one Worker's key reads. */
export const pillLabel = (worker: WorkerUnit, key: string) =>
  worker.kind === 'each' ? CARD.short(key) : worker.name;

/** The pills of one Worker's row, each with the gap after it. */
const pillsOf = (worker: WorkerUnit) =>
  worker.keys.length === 0
    ? [CARD.pill('nothing')]
    : worker.keys.map(({ key }) => CARD.pill(pillLabel(worker, key)) + 4);

/** How many lines one Worker's row takes `across`, its pills wrapping after its lead. */
const linesOf = (worker: WorkerUnit, across: number) => {
  let lines = 1;
  let used = CARD.lead(worker);
  for (const pill of pillsOf(worker)) {
    if (used + pill > across && used > CARD.lead(worker)) {
      lines++;
      used = 0;
    }
    used += pill;
  }
  return lines;
};

/** How wide a card's header reads: an Actor's mark, name and key, or a State's tag, then the badge. */
const headWidth = (owner: Unit | Group) =>
  ('actor' in owner
    ? CARD.mark +
      6 +
      textWidth(owner.actor, 7) +
      (owner.instance?.key === undefined
        ? 0
        : textWidth(owner.instance.key, 6.6) + 6)
    : textWidth(owner.tag ?? '', 6.6)) +
  6 +
  BADGE;

const cards = new WeakMap<
  Unit | Group,
  { readonly width: number; readonly height: number } | undefined
>();

/** How big an owner's open card is; `undefined` when closed or it owns no Workers. */
const cardOf = (owner: Unit | Group) => {
  if (!owner.open || owner.workers.length === 0) return undefined;
  let card = cards.get(owner);
  if (!card) {
    const content = Math.max(
      headWidth(owner),
      ...owner.workers.map(
        (worker) =>
          CARD.lead(worker) +
          pillsOf(worker).reduce((sum, pill) => sum + pill, 0),
      ),
    );
    const width = Math.min(
      CARD.max,
      Math.max(CARD.min, content + CARD.pad * 2),
    );
    const across = width - CARD.pad * 2;
    const lines = owner.workers.reduce(
      (sum, worker) => sum + linesOf(worker, across),
      0,
    );
    card = {
      width,
      height: CARD.pad * 2 + CARD.head + 4 + lines * CARD.line + CARD.slack,
    };
    cards.set(owner, card);
  }
  return card;
};

/** The Card an owner's node grows into, when open. */
const cardNode = (owner: Unit | Group): Card | undefined => {
  const card = cardOf(owner);
  return (
    card && {
      ...card,
      workers: owner.workers,
      instance: owner.workers[0]?.instance,
    }
  );
};

/**
 * How wide a Unit or Group is, where its own node sits from its left edge
 * (the middle), and how far in its row below starts.
 */
interface Box {
  readonly width: number;
  readonly anchor: number;
  readonly shift: number;
}

const boxes = new WeakMap<Unit | Group, Box>();

/** A row of Boxes side by side, centred under a node `half` wide each way. */
const row = (items: ReadonlyArray<Box>, half: number): Box => {
  const across =
    items.reduce((sum, item) => sum + item.width, 0) +
    GAP * Math.max(items.length - 1, 0);
  const width = Math.max(across, half * 2);
  return { width, anchor: width / 2, shift: (width - across) / 2 };
};

/** Half of what an owner's node takes across: its label, or its card when open. */
const halfOf = (owner: Unit | Group, node: number) =>
  Math.max(node, cardOf(owner)?.width ?? 0) / 2;

const groupBox = (group: Group): Box => {
  let box = boxes.get(group);
  if (!box)
    boxes.set(
      group,
      (box = row(
        group.units.map(unitBox),
        halfOf(group, group.tag === undefined ? 0 : pillWidth(group.tag)),
      )),
    );
  return box;
};

const unitBox = (unit: Unit): Box => {
  let box = boxes.get(unit);
  if (!box)
    boxes.set(
      unit,
      (box = row(unit.groups.map(groupBox), halfOf(unit, labelWidth(unit)))),
    );
  return box;
};

/** A curve from one point down to another. */
export const curve = (x1: number, y1: number, x2: number, y2: number) => {
  const mid = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`;
};

/** The dimmer of a parent's and a child's look, for the edge between them. */
const edgeOf = (parent: Status, child: Status): Status =>
  child === 'dim' || parent === 'dim'
    ? 'dim'
    : child === 'stopped' || child === 'started'
      ? child
      : parent === 'changed'
        ? 'same'
        : parent;

/** An owner's Workers summed up for its badge. */
const badgeOf = (owner: Unit | Group): Badge | undefined => {
  if (owner.workers.length === 0) return undefined;
  const count = owner.workers.reduce(
    (sum, worker) =>
      sum + worker.keys.filter((key) => key.life !== 'stopped').length,
    0,
  );
  const status = owner.workers.some((worker) => worker.status === 'started')
    ? 'started'
    : owner.workers.some((worker) => worker.status === 'stopped')
      ? 'stopped'
      : count === 0
        ? 'dim'
        : 'same';
  return { count, status, open: owner.open };
};

/** Half of what a Unit's node takes down: its circle, or its card when open. */
const unitHalf = (unit: Unit) => (cardOf(unit)?.height ?? CIRCLE) / 2;

/** Lay out the root's Unit, with the root at x 0. */
export const layout = (
  root: Unit,
): Laid & {
  /** Where each node's centre is, by node ID. */
  readonly centers: ReadonlyMap<
    string,
    { readonly x: number; readonly y: number }
  >;
} => {
  const nodes: Array<GraphNode> = [];
  const edges: Array<Edge> = [];
  const centers = new Map<string, { x: number; y: number }>();
  const at = new Map<string, string>();

  /** Lay out a Unit from `left`, its node's top edge at `top`; returns the bottom of everything below it. */
  const place = (unit: Unit, left: number, top: number): number => {
    const box = unitBox(unit);
    const x = left + box.anchor;
    const card = cardNode(unit);
    const y = top + unitHalf(unit);
    nodes.push(
      unit.many
        ? {
            kind: 'many',
            id: unit.id,
            x,
            y,
            width: labelWidth(unit),
            actor: unit.actor,
            count: unit.many.count,
            open: unit.many.open,
            status: unit.status,
          }
        : {
            kind: 'actor',
            id: unit.id,
            x,
            y,
            width: labelWidth(unit),
            actor: unit.actor,
            instance: unit.instance,
            status: unit.status,
            workers: badgeOf(unit),
            card,
          },
    );
    centers.set(unit.id, { x, y });
    if (unit.instance) at.set(unit.instance.id, unit.id);
    // A closed keyed Child stands in for every Instance in it.
    if (unit.many && !unit.many.open)
      for (const member of unit.many.members) at.set(member, unit.id);
    // Where the node ends: under its label, or at its card's bottom edge.
    // A short card never pulls what hangs below it up.
    const under = y + CIRCLE / 2 + LABEL;
    const end = card ? y + card.height / 2 : under;
    const base = Math.max(end, under);
    let bottom = base;

    let start = left + box.shift;
    for (const group of unit.groups) {
      const span = groupBox(group);
      const gx = start + span.anchor;
      let low = bottom;
      let from = { x, y: end };
      let kidsTop = base + TO_CHILD - CIRCLE;
      if (group.tag !== undefined) {
        const stateCard = cardNode(group);
        const stateTop = base + TO_STATE - CIRCLE / 2 - LABEL - PILL / 2;
        const half = stateCard ? stateCard.height / 2 : PILL / 2;
        const gy = stateTop + half;
        nodes.push({
          kind: 'state',
          id: group.id,
          x: gx,
          y: gy,
          width: pillWidth(group.tag),
          tag: group.tag,
          status: group.status,
          workers: badgeOf(group),
          card: stateCard,
        });
        edges.push({
          id: `${unit.id}->${group.id}`,
          d: curve(from.x, from.y, gx, stateTop),
          status: edgeOf(unit.status, group.status),
        });
        // The Children it Invokes hang from its pill, or from its card.
        const stateBase = gy + half;
        from = { x: gx, y: stateBase };
        kidsTop = stateBase + TO_CHILD - PILL / 2 - CIRCLE / 2;
        low = stateBase;
      }
      let kidLeft = start + span.shift;
      for (const kid of group.units) {
        const kidBox = unitBox(kid);
        edges.push({
          id: `${group.id}->${kid.id}`,
          d: curve(from.x, from.y, kidLeft + kidBox.anchor, kidsTop),
          status: edgeOf(group.status, kid.status),
        });
        low = Math.max(low, place(kid, kidLeft, kidsTop));
        kidLeft += kidBox.width + GAP;
      }
      bottom = Math.max(bottom, low);
      start += span.width + GAP;
    }
    return bottom;
  };

  // The root at x 0, its centre where a closed circle's is, whatever is
  // open: its card grows around it, and everything else hangs around it.
  const rootTop = PAD + CIRCLE / 2 - unitHalf(root);
  const bottom = place(root, -unitBox(root).anchor, rootTop);
  return {
    nodes,
    edges,
    at,
    centers,
    width: unitBox(root).width + PAD * 2,
    top: Math.min(0, rootTop - PAD),
    height: bottom + PAD,
  };
};
