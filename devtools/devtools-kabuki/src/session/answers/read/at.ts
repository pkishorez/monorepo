import { Snapshot } from '@kestack/kabuki';
import type { History } from '@kestack/kabuki';
import { fromLive, type GraphNode } from './graph.ts';
import { learn, type ProvidedBy } from './learned.ts';
import { changesOf, walk } from './steps.ts';

/*
 * The app at one Step, as the canvas draws it: the Step's Snapshot played
 * from the History, each Instance the Step changed marked, and the card
 * its Message was for told what came of it. Live and a Story both draw
 * from it, so they draw the same thing.
 */

/** The app at the Step after `id`, or at init for null; undefined when the Step is no longer kept. */
export const graphAt = (
  history: History.History,
  id: number | null,
  providedBy?: ProvidedBy,
): GraphNode | undefined => {
  const root = history.actor.definition;
  try {
    // Found on its own Branch, so an entry a fork left behind is read too.
    const entry =
      id === null ? undefined : history.branch(id).find((one) => one.id === id);
    const after: Snapshot.Snapshot = history.snapshotAt(id);
    const before = entry ? history.snapshotAt(entry.parent) : undefined;
    const changes = changesOf(before, after, root);
    // What the Step asked for: its rules played again, as they are pure.
    const commands =
      entry && before
        ? Snapshot.handle(root, before, entry).commands.map((command) =>
            String((command as { readonly name?: unknown }).name ?? 'command'),
          )
        : [];
    const took = entry
      ? {
          destination: entry.destination,
          message: entry.message._tag,
          commands,
          outcome: history.outcome(entry.id),
        }
      : undefined;
    return fromLive(
      walk(after, root),
      changes,
      undefined,
      learn(history, root, providedBy),
      took,
    );
  } catch {
    return undefined;
  }
};
