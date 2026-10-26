import type { ActorDefinition, History, Snapshot } from '@kestack/kabuki';
import { providedBy } from '../inspected.ts';
import { nameOf } from './blueprint.ts';
import { changesOf, nodesOf, walk, workersOf, type Change } from './steps.ts';

/*
 * What a definition cannot say, learned from what code did: its History
 * played once, Step by Step, each Snapshot the next one's start.
 *
 * 1. Moves   which Message took an Actor from which State to which.
 * 2. Ran     which States each Worker has run in, so a Worker written at
 *            the top that only ever runs in one is filed under it.
 * 3. Gives   what each Actor provides, from code's Runtime, now.
 * 4. Touched every Step that changed an Instance, for its own story.
 *
 * Learned facts are true of what happened, not of every run: a move never
 * seen is not shown, and nothing says it cannot happen.
 */

export interface Move {
  readonly from: string;
  readonly message: string;
  readonly to: string;
  readonly count: number;
}

export interface Gives {
  readonly top: ReadonlyArray<string>;
  /** By the State that provides them. */
  readonly state: Readonly<Record<string, ReadonlyArray<string>>>;
}

export interface Touch {
  readonly entry: number;
  readonly message: string;
  /** Whether the Message was for this Instance, not something else's. */
  readonly own: boolean;
  readonly change: Change;
}

export interface Known {
  readonly moves: ReadonlyArray<Move>;
  /** Each Worker, by the States it has run in. */
  readonly ran: ReadonlyMap<string, ReadonlySet<string>>;
  readonly gives: Gives;
}

export interface Learned {
  readonly of: (definition: ActorDefinition) => Known;
  readonly touched: (instance: string) => ReadonlyArray<Touch>;
}

const NONE: Known = {
  moves: [],
  ran: new Map(),
  gives: { top: [], state: {} },
};

interface Kept {
  readonly last: number | null;
  readonly learned: Learned;
}

const kept = new WeakMap<History, Kept>();

export const learn = (history: History, root: ActorDefinition): Learned => {
  const branch = history.branch();
  const last = branch.at(-1)?.id ?? null;
  const was = kept.get(history);
  if (was && was.last === last) return was.learned;

  const moves = new Map<ActorDefinition, Map<string, Move>>();
  const ran = new Map<ActorDefinition, Map<string, Set<string>>>();
  const touched = new Map<string, Touch[]>();
  const gives = new Map<
    ActorDefinition,
    { top: Set<string>; state: Map<string, Set<string>> }
  >();

  // 2. Ran: every Instance's Workers, at one Snapshot.
  const saw = (snapshot: Snapshot) => {
    for (const node of nodesOf(walk(snapshot, root))) {
      const workers =
        ran.get(node.definition) ?? new Map<string, Set<string>>();
      ran.set(node.definition, workers);
      for (const { name, keys } of workersOf(node.instance, node.definition))
        if (keys.length > 0) {
          const states = workers.get(name) ?? new Set<string>();
          states.add(node.instance.state._tag);
          workers.set(name, states);
        }
    }
  };

  let before: Snapshot | undefined;
  try {
    before = history.snapshotAt(branch[0]?.parent ?? null);
    saw(before);
  } catch {
    before = undefined;
  }
  for (const entry of branch) {
    let after: Snapshot;
    try {
      after = history.snapshotAt(entry.id);
    } catch {
      continue;
    }
    const definitions = new Map(
      nodesOf(walk(after, root)).map((node) => [
        node.instance.id,
        node.definition,
      ]),
    );
    for (const [id, change] of changesOf(before, after, root)) {
      // 4. Touched
      const list = touched.get(id) ?? [];
      list.push({
        entry: entry.id,
        message: entry.message._tag,
        own: id === entry.destination,
        change,
      });
      touched.set(id, list);
      // 1. Moves: only a Message for the Instance moves it on its own.
      const definition = definitions.get(id);
      if (!definition || !change.state || id !== entry.destination) continue;
      const [from, to] = change.state;
      const key = `${from}|${entry.message._tag}|${to}`;
      const byKey = moves.get(definition) ?? new Map<string, Move>();
      const move = byKey.get(key);
      byKey.set(key, {
        from,
        message: entry.message._tag,
        to,
        count: (move?.count ?? 0) + 1,
      });
      moves.set(definition, byKey);
    }
    saw(after);
    before = after;
  }

  // 3. Gives: what code's Runtime says each Instance provides now.
  if (before)
    for (const node of nodesOf(walk(before, root))) {
      const { top, state } = providedBy(node.instance.id);
      if (top.length + state.length === 0) continue;
      const kept = gives.get(node.definition) ?? {
        top: new Set(),
        state: new Map(),
      };
      top.forEach((key) => kept.top.add(nameOf(key)));
      const here =
        kept.state.get(node.instance.state._tag) ?? new Set<string>();
      state.forEach((key) => here.add(nameOf(key)));
      kept.state.set(node.instance.state._tag, here);
      gives.set(node.definition, kept);
    }

  const learned: Learned = {
    of: (definition) => {
      const given = gives.get(definition);
      return {
        moves: [...(moves.get(definition)?.values() ?? [])],
        ran: ran.get(definition) ?? NONE.ran,
        gives: given
          ? {
              top: [...given.top],
              state: Object.fromEntries(
                [...given.state].map(([tag, keys]) => [tag, [...keys]]),
              ),
            }
          : NONE.gives,
      };
    },
    touched: (id) => touched.get(id) ?? [],
  };
  kept.set(history, { last, learned });
  return learned;
};
