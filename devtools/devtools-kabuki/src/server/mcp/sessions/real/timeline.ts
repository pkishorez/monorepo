import type { Entry, Now } from '../../../rpc/session/contract/index.ts';
import {
  type Chain,
  chainLine,
  chainsOf,
  foldedLine,
  headOf,
  keyOf,
} from './chains.ts';
import type { Details, Drawn } from './details.ts';
import type { NameOf } from './names.ts';

export type Only = 'changed' | 'unhandled';

export interface Filter {
  readonly instance?: string;
  readonly tag?: string;
  readonly only?: Only;
  readonly before?: number;
  readonly lines?: number;
}

const LINES = 20;

const touches = (chain: Chain, address: string) =>
  chain.entries.some(
    ({ to, from }) =>
      to === address || (from.kind !== 'outside' && from.instance === address),
  );

const matches =
  ({ instance, tag, only }: Filter) =>
  (chain: Chain) =>
    (instance === undefined || touches(chain, instance)) &&
    (tag === undefined ||
      chain.entries.some(
        (one) => one.tag.toLowerCase() === tag.toLowerCase(),
      )) &&
    (only !== 'changed' || chain.entries.some(({ changed }) => changed)) &&
    (only !== 'unhandled' ||
      chain.entries.some(({ outcome }) => outcome !== 'handled'));

export const linesOf = (
  chains: ReadonlyArray<Chain>,
  name: NameOf,
  most: number,
  details: Details,
) => {
  const lines: Array<string> = [];
  const wanted: Array<number> = [];
  let at = 0;
  while (at < chains.length && lines.length < most) {
    const chain = chains[at]!;
    const head = headOf(chain);
    wanted.push(head.id);
    const ran = details.get(head.id)?.commands.length ?? 0;
    const key = ran === 0 ? keyOf(chain, name) : undefined;
    let end = at + 1;
    if (key !== undefined)
      while (end < chains.length && keyOf(chains[end]!, name) === key) end++;
    if (end - at > 1) lines.push(foldedLine(chains.slice(at, end), name));
    else {
      wanted.push(...chain.entries.map(({ id }) => id));
      lines.push(chainLine(chain, name, details));
    }
    at = end;
  }
  return { lines, shown: chains.slice(0, at), wanted };
};

export const nowText = (now: Now) =>
  [
    `head ${now.head ?? 'start'}`,
    ...(now.previewing === null
      ? []
      : [`showing step ${now.previewing} (kabuki_travel to: null comes back)`]),
    ...(now.failure === null ? [] : [`app failed: ${now.failure}`]),
  ].join(' · ');

export const timelineOf = (
  now: Now,
  line: ReadonlyArray<Entry>,
  filter: Filter,
  name: NameOf,
  details: Details,
): Drawn<string> => {
  const all = chainsOf(line);
  const kept = all
    .filter(matches(filter))
    .filter(
      (chain) =>
        filter.before === undefined || headOf(chain).id < filter.before,
    )
    .reverse();
  const { lines, shown, wanted } = linesOf(
    kept,
    name,
    filter.lines ?? LINES,
    details,
  );
  const left = kept.length - shown.length;
  const oldest = shown.at(-1);
  const drawn = [
    `${nowText(now)} · ${all.length} Chain${all.length === 1 ? '' : 's'}, newest first; id → kabuki_step`,
    ...(lines.length > 0
      ? lines
      : [all.length === 0 ? 'no Steps yet' : 'no Chain matches']),
    ...(left === 0 || oldest === undefined
      ? []
      : [`${left} older: before: ${headOf(oldest).id}`]),
  ].join('\n');
  return { drawn, wanted };
};
