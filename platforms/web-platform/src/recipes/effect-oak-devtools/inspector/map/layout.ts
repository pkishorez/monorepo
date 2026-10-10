import type { Instance } from 'effect-oak';
import type { Status, Unit, Group } from './units.ts';

/*
 * Units laid out top-down: each parent centred over its Children, the root at
 * x 0 for good. Each Unit is an Actor circle, or a keyed stack; each Group a
 * State pill, with nothing under it when it Invokes nothing. Pure.
 */

export interface ActorNode {
  readonly kind: 'actor';
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly actor: string;
  /** The Instance here at this Step, or the one that just stopped. */
  readonly instance: Instance | undefined;
  readonly status: Status;
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
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly tag: string;
  readonly status: Status;
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
  readonly height: number;
}

export const CIRCLE = 36;
const LABEL = 30;
const PILL = 24;
const GAP = 28;
const TO_STATE = 92;
const TO_CHILD = 88;
const PAD = 32;

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

const groupBox = (group: Group): Box => {
  let box = boxes.get(group);
  if (!box)
    boxes.set(
      group,
      (box = row(
        group.units.map(unitBox),
        group.tag === undefined ? 0 : pillWidth(group.tag) / 2,
      )),
    );
  return box;
};

const unitBox = (unit: Unit): Box => {
  let box = boxes.get(unit);
  if (!box)
    boxes.set(
      unit,
      (box = row(unit.groups.map(groupBox), labelWidth(unit) / 2)),
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

  /** Lay out a Unit from `left`; returns the bottom of everything below it. */
  const place = (unit: Unit, left: number, y: number): number => {
    const box = unitBox(unit);
    const x = left + box.anchor;
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
          },
    );
    centers.set(unit.id, { x, y });
    if (unit.instance) at.set(unit.instance.id, unit.id);
    // A closed keyed Child stands in for every Instance in it.
    if (unit.many && !unit.many.open)
      for (const member of unit.many.members) at.set(member, unit.id);
    let bottom = y + CIRCLE / 2 + LABEL;

    let start = left + box.shift;
    for (const group of unit.groups) {
      const span = groupBox(group);
      const gx = start + span.anchor;
      let low = bottom;
      let from = { x, y: y + CIRCLE / 2 + LABEL };
      let kidsY = y + TO_CHILD + LABEL;
      if (group.tag !== undefined) {
        const gy = y + TO_STATE;
        nodes.push({
          kind: 'state',
          id: group.id,
          x: gx,
          y: gy,
          width: pillWidth(group.tag),
          tag: group.tag,
          status: group.status,
        });
        edges.push({
          id: `${unit.id}->${group.id}`,
          d: curve(from.x, from.y, gx, gy - PILL / 2),
          status: edgeOf(unit.status, group.status),
        });
        from = { x: gx, y: gy + PILL / 2 };
        kidsY = gy + TO_CHILD;
        low = gy + PILL / 2;
      }
      let kidLeft = start + span.shift;
      for (const kid of group.units) {
        const kidBox = unitBox(kid);
        edges.push({
          id: `${group.id}->${kid.id}`,
          d: curve(from.x, from.y, kidLeft + kidBox.anchor, kidsY - CIRCLE / 2),
          status: edgeOf(group.status, kid.status),
        });
        low = Math.max(low, place(kid, kidLeft, kidsY));
        kidLeft += kidBox.width + GAP;
      }
      bottom = Math.max(bottom, low);
      start += span.width + GAP;
    }
    return bottom;
  };

  // The root at x 0, whatever is open: everything else hangs around it.
  const bottom = place(root, -unitBox(root).anchor, PAD + CIRCLE / 2);
  return {
    nodes,
    edges,
    at,
    centers,
    width: unitBox(root).width + PAD * 2,
    height: bottom + PAD,
  };
};
