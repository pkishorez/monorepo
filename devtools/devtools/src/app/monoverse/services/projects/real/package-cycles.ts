import type { Link } from '../contract/index.js';

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
