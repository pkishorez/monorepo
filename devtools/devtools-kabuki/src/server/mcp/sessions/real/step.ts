import type {
  BeforeAfter,
  Change,
  Entry,
  Wanted,
} from '../../../rpc/session/contract/index.ts';
import { type Chain, sourceOf } from './chains.ts';
import { type Detail, type Details, type Drawn, NOTHING } from './details.ts';
import type { NameOf } from './names.ts';
import { brief, dataOf, field, inline, seconds, tagOf } from './text.ts';

const SIDE = 34;

const workerText = ({ name, key }: Wanted) =>
  key === undefined || key === '' ? name : `${name}[${key}]`;

const ITEMS = 5;

const plain = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const same = (one: unknown, other: unknown) =>
  JSON.stringify(one) === JSON.stringify(other);

const itemsText = (
  sign: string,
  items: ReadonlyArray<unknown>,
  depth: number,
) => [
  ...items
    .slice(0, ITEMS)
    .map(
      (item) =>
        `${'  '.repeat(depth)}${sign} ${inline(item, 70 - depth * 2) ?? brief(item).text}`,
    ),
  ...(items.length > ITEMS
    ? [`${'  '.repeat(depth)}${sign} … ${items.length - ITEMS} more`]
    : []),
];

const diffOf = (
  path: string,
  before: unknown,
  after: unknown,
  depth: number,
  nested = 0,
): ReadonlyArray<string> => {
  if (same(before, after)) return [];
  const pad = '  '.repeat(depth);
  const was = before === undefined ? '—' : inline(before, SIDE);
  const is = after === undefined ? '—' : inline(after, SIDE);
  if (was !== undefined && is !== undefined)
    return [`${pad}${path}: ${was} → ${is}`];
  if (Array.isArray(before) && Array.isArray(after))
    return [
      `${pad}${path}: ${before.length} → ${after.length} items`,
      ...itemsText(
        '+',
        after.filter((item) => !before.some((one) => same(one, item))),
        depth + 1,
      ),
      ...itemsText(
        '−',
        before.filter((item) => !after.some((one) => same(one, item))),
        depth + 1,
      ),
    ];
  if (plain(before) && plain(after) && nested < 3)
    return [
      ...new Set([...Object.keys(before), ...Object.keys(after)]),
    ].flatMap((key) =>
      diffOf(`${path}.${key}`, before[key], after[key], depth, nested + 1),
    );
  return [
    `${pad}${path}:`,
    field('before', before, depth + 1),
    field('after', after, depth + 1),
  ];
};

const fieldsText = (
  label: string,
  fields: Readonly<Record<string, BeforeAfter>>,
  depth: number,
) =>
  Object.entries(fields).flatMap(([key, side]) =>
    diffOf(`${label}${key}`, side.before, side.after, depth),
  );

const stateLine = (
  state: NonNullable<Extract<Change, { _tag: 'Changed' }>['state']>,
  depth: number,
) => {
  const was = tagOf(state.before) ?? '?';
  const is = tagOf(state.after) ?? '?';
  const data = dataOf(state.after);
  return [
    `${'  '.repeat(depth)}State ${was} → ${is}`,
    ...(data === undefined ? [] : [field('data', data, depth + 1)]),
  ].join('\n');
};

const changeText = (change: Change, name: NameOf, depth: number) => {
  const pad = '  '.repeat(depth);
  if (change._tag !== 'Changed') {
    const sign = change._tag === 'Added' ? '+' : '−';
    const data = dataOf(change.state);
    const model = brief(change.model);
    const state = tagOf(change.state) ?? '?';
    return [
      `${pad}${sign}${name(change.address)}${state === 'Single' ? '' : ` [${state}]`}`,
      ...(data === undefined ? [] : [`${pad}  data: ${brief(data).text}`]),
      ...(model.text === '{}' ? [] : [`${pad}  model: ${model.text}`]),
      ...(change.props === undefined
        ? []
        : [`${pad}  props: ${brief(change.props).text}`]),
      ...(change.workers.length === 0
        ? []
        : [`${pad}  workers: ${change.workers.map(workerText).join(', ')}`]),
    ].join('\n');
  }
  const { state, model, props, workers } = change;
  return [
    `${pad}${name(change.address)}:`,
    ...(state === undefined ? [] : [stateLine(state, depth + 1)]),
    ...fieldsText('', model, depth + 1),
    ...fieldsText('props.', props, depth + 1),
    ...(workers.started.length === 0
      ? []
      : [
          `${pad}  started worker ${workers.started.map(workerText).join(', ')}`,
        ]),
    ...(workers.stopped.length === 0
      ? []
      : [
          `${pad}  stopped worker ${workers.stopped.map(workerText).join(', ')}`,
        ]),
  ].join('\n');
};

const entryText = (
  entry: Entry,
  name: NameOf,
  { message, changes, commands }: Detail,
) => {
  const payload = dataOf(message);
  return [
    `${entry.id}  ${entry.tag} → ${name(entry.to)}  from ${sourceOf(entry, name)} · ${entry.outcome}`,
    ...(payload === undefined ? [] : [field('message', payload, 1)]),
    ...(changes.length === 0 && commands.length === 0
      ? ['  no change']
      : changes.map((change) => changeText(change, name, 1))),
    ...commands.map(
      ({ name: command, args }) =>
        `  command ${command}${args === undefined ? '' : ` ${inline(args, 100) ?? '{…}'}`}`,
    ),
  ].join('\n');
};

export const stepOf = (
  chain: Chain,
  name: NameOf,
  details: Details,
): Drawn<string> => {
  const first = chain.entries[0]!;
  const last = chain.entries.at(-1)!;
  const ids = first.id === last.id ? `${first.id}` : `${first.id}–${last.id}`;
  const drawn = [
    `Chain ${ids} @${seconds(first.at)}, ${chain.entries.length} Step${chain.entries.length === 1 ? '' : 's'}${chain.cut ? ', its start Compacted away' : ''}`,
    ...chain.entries.map((entry) =>
      entryText(entry, name, details.get(entry.id) ?? NOTHING),
    ),
  ].join('\n');
  return { drawn, wanted: chain.entries.map(({ id }) => id) };
};

export const chainOf = (chains: ReadonlyArray<Chain>, id: number) =>
  chains.find((chain) => chain.entries.some((entry) => entry.id === id));
