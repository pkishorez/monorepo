import type { Instance } from '@kestack/kabuki';

/*
 * What the Map is made of, before it is laid out: one Node per place an
 * Actor can run, standing for every Instance there now.
 *
 * A Node is a card: its Actor's name, the States it can be in, as options,
 * and the Workers written in it, as rows. All three come from the Actor,
 * never the data, so a card's size never changes and the Map never moves:
 * the Snapshot only says how many Instances run there, which State each is
 * in, and which Worker keys run now.
 */

/** Whether a Worker key is running, finished or failed; `on` away from the live app, where only its Condition is known. */
export type WorkerStatus = 'running' | 'finished' | 'failed' | 'on';

/** One Worker key a Condition names now. */
export interface WorkerKey {
  /** Unique on the Map. */
  readonly id: string;
  /** `''` for the one Worker of a kind other than `each`. */
  readonly key: string;
  readonly instance: Instance;
  readonly status: WorkerStatus;
}

/** One Worker an Actor has, written at its top or in one State, and the keys it runs now. */
export interface WorkerRow {
  readonly name: string;
  /** The State it is written in; none at the top. */
  readonly state?: string;
  readonly keys: ReadonlyArray<WorkerKey>;
}

/** One State an Actor can be in, and how many of its Instances are in it. */
export interface StateOption {
  readonly tag: string;
  readonly count: number;
}

export interface ActorNode {
  readonly id: string;
  readonly name: string;
  /** A slot of keyed Children: one card for many Instances, showing one at a time. */
  readonly many: boolean;
  /** Every Instance at this place, under the Instances chosen above it. */
  readonly instances: ReadonlyArray<Instance>;
  /** The Instance a place of many shows: its State, its Workers, and what hangs below it. */
  readonly chosen?: Instance;
  /** Its States, in lines as the card draws them; none for an Actor without States. */
  readonly states?: ReadonlyArray<ReadonlyArray<StateOption>>;
  readonly workers: ReadonlyArray<WorkerRow>;
  /** Its size, from the Actor alone. */
  readonly width: number;
  readonly height: number;
}

/** A Node with what hangs below it, each by the State that Invokes it, if one does. */
export interface Item {
  readonly node: ActorNode;
  readonly children: ReadonlyArray<{
    readonly via?: string;
    readonly item: Item;
  }>;
}

/** The card's measures, shared by the layout and the drawing so they always agree. */
export const CARD = {
  pad: 10,
  header: 22,
  line: 22,
  row: 22,
  gap: 6,
  min: 168,
  max: 300,
} as const;

const optionWidth = (tag: string, many: boolean) =>
  10 + 6 + tag.length * 6.6 + (many ? 22 : 0) + 12;

/** A card's size and the lines its States fall into, from its Actor alone. */
export const measure = (
  name: string,
  many: boolean,
  states: ReadonlyArray<string> | undefined,
  workers: ReadonlyArray<string>,
) => {
  // A place of many has a switcher in its header.
  const header = 16 + 8 + name.length * 7.4 + (many ? 92 : 0);
  const rows = workers.reduce(
    (widest, worker) => Math.max(widest, 16 + worker.length * 6.8 + 72),
    0,
  );
  const inner = Math.min(
    CARD.max - CARD.pad * 2,
    Math.max(CARD.min - CARD.pad * 2, header, rows),
  );
  // States wrap into as many lines as they need inside the card's width.
  const lines: string[][] = [];
  let used = Infinity;
  for (const tag of states ?? []) {
    const width = optionWidth(tag, many);
    if (used + width > inner) {
      lines.push([]);
      used = 0;
    }
    lines.at(-1)!.push(tag);
    used += width;
  }
  const height =
    CARD.pad * 2 +
    CARD.header +
    (lines.length ? CARD.gap + lines.length * CARD.line : 0) +
    (workers.length ? CARD.gap + workers.length * CARD.row : 0);
  return { width: inner + CARD.pad * 2, height, lines };
};
