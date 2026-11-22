import type { Link } from './rules.js';

/**
 * Every elementary cycle in a graph of names, each reported once: starting
 * at its alphabetically first member, in dependency order. The list of
 * cycles is sorted by their members.
 */
export function findCycles(
  edges: ReadonlyMap<string, ReadonlyArray<string>>,
): Array<Array<string>> {
  const predecessors = new Map<string, Array<string>>();
  for (const [name, targets] of edges) {
    for (const target of targets) {
      const incoming = predecessors.get(target) ?? [];
      incoming.push(name);
      predecessors.set(target, incoming);
    }
  }
  const cycles: Array<Array<string>> = [];

  for (const start of edges.keys()) {
    // A cycle starts at its smallest name and only visits nodes that can return
    // to it. This avoids enumerating every path through acyclic dependencies.
    const canReturn = new Set([start]);
    const pending = [start];
    while (pending.length > 0) {
      for (const previous of predecessors.get(pending.pop()!) ?? []) {
        if (previous.localeCompare(start) < 0 || canReturn.has(previous))
          continue;
        canReturn.add(previous);
        pending.push(previous);
      }
    }
    const path = [start];
    const onPath = new Set(path);
    const visit = (name: string) => {
      for (const next of edges.get(name) ?? []) {
        if (next === start) {
          cycles.push([...path]);
        } else if (canReturn.has(next) && !onPath.has(next)) {
          path.push(next);
          onPath.add(next);
          visit(next);
          onPath.delete(next);
          path.pop();
        }
      }
    };
    visit(start);
  }
  return cycles.sort((left, right) => left.join().localeCompare(right.join()));
}

/**
 * The links that close each cycle, from one member to the next and the
 * last back to the first, by whatever `place` names each member: a
 * Package's name to its folder, in the repo view.
 */
export function cycleLinks(
  cycles: ReadonlyArray<ReadonlyArray<string>>,
  place: (name: string) => string | undefined,
): ReadonlyArray<Link> {
  const links = new Map<string, Link>();
  for (const members of cycles) {
    members.forEach((name, index) => {
      const from = place(name);
      const to = place(members[(index + 1) % members.length]!);
      if (from === undefined || to === undefined) return;
      links.set(`${from}\0${to}`, [from, to]);
    });
  }
  return [...links.values()];
}
