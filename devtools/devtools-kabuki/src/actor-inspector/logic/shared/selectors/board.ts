import type { DataOf } from '@kestack/kabuki/types';
import type {
  BeforeAfter,
  Board,
  Card,
  Change,
  Changed,
  Field,
  InspectorShape,
  Job,
  Mark,
  Node,
  Played,
  Within,
} from '../index.ts';

type Data = DataOf<typeof InspectorShape>;

type Removed = Extract<Change, { readonly _tag: 'Removed' }>;

type Plain = Readonly<Record<string, unknown>>;

interface Sending {
  readonly address: string;
  readonly worker?: string;
  readonly key?: string;
}

const SEGMENT = /^(?:[^/:[\]#]+:)?([^/:[\]#]+)(?:\[[^/[\]]*\])?#\d+$/;

const lastOf = (address: string) => address.slice(address.lastIndexOf('/') + 1);

export const nameOf = (address: string): string =>
  SEGMENT.exec(lastOf(address))?.[1] ?? address;

const parentOf = (address: string) =>
  address.slice(0, Math.max(0, address.lastIndexOf('/')));

const isRecord = (value: unknown): value is Plain =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const recordOf = (value: unknown): Plain =>
  isRecord(value) ? value : value === undefined ? {} : { value };

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

const tagOf = (state: unknown): string =>
  isRecord(state) && typeof state['_tag'] === 'string' ? state['_tag'] : '';

const untagged = (state: unknown): Plain => {
  if (!isRecord(state)) return {};
  const { _tag: _, ...data } = state;
  return data;
};

const fieldsOf = (
  now: unknown,
  changes: Readonly<Record<string, BeforeAfter>>,
  removed: boolean,
): ReadonlyArray<Field> => {
  const current = recordOf(now);
  const kept = Object.entries(current).map(([key, value]): Field => {
    const change = changes[key];
    if (!change) return { key, value, kind: 'same' };
    return 'before' in change
      ? { key, value, before: change.before, kind: 'changed' }
      : { key, value, kind: 'added' };
  });
  const gone = removed
    ? Object.entries(changes)
        .filter(([key, change]) => !(key in current) && 'before' in change)
        .map(([key, change]): Field => ({
          key,
          value: change.before,
          kind: 'removed',
        }))
    : [];
  return [...kept, ...gone];
};

const dataChanges = (
  change: Changed | undefined,
): Readonly<Record<string, BeforeAfter>> => {
  if (!change?.state || change.state.transition) return {};
  const before = untagged(change.state.before);
  const after = untagged(change.state.after);
  return Object.fromEntries(
    [...new Set([...Object.keys(before), ...Object.keys(after)])]
      .filter((key) => !same(before[key], after[key]))
      .map((key) => [
        key,
        {
          ...(key in before ? { before: before[key] } : {}),
          ...(key in after ? { after: after[key] } : {}),
        },
      ]),
  );
};

const namesWithin = (node: Node, within: Within) =>
  node.provides.filter((one) => one.within === within).map(({ name }) => name);

const ghostOf = (change: Removed): Node => ({
  address: change.address,
  actor: change.actor,
  slot: nameOf(change.address),
  ...(change.key === undefined ? {} : { key: change.key }),
  state: tagOf(change.state),
  data: untagged(change.state),
  model: change.model,
  ...(change.props === undefined ? {} : { props: change.props }),
  workers: change.workers.map((one) => ({ ...one, within: 'always' })),
  provides: [],
  children: [],
});

const withGhosts = (tree: Node, ghosts: ReadonlyArray<Node>): Node => {
  const under = new Map<string, Array<Node>>();
  for (const ghost of ghosts) {
    const parent = parentOf(ghost.address);
    under.set(parent, [...(under.get(parent) ?? []), ghost]);
  }
  const grow = (node: Node): Node => ({
    ...node,
    children: [...node.children, ...(under.get(node.address) ?? [])].map(grow),
  });
  return grow(tree);
};

const senderOf = (message: Played | null): Sending | null =>
  message && message.from.kind !== 'outside'
    ? {
        address: message.from.instance,
        ...(message.from.kind === 'worker'
          ? {
              worker: message.from.name,
              ...(message.from.key === undefined
                ? {}
                : { key: message.from.key }),
            }
          : {}),
      }
    : null;

const markOf = (keys: Job['keys']): Mark =>
  keys.every(({ mark }) => mark === 'stopped')
    ? 'stopped'
    : keys.some(({ mark }) => mark === 'started')
      ? 'started'
      : null;

const jobsOf = (
  node: Node,
  change: Changed | undefined,
  removed: boolean,
  sending: Sending | null,
): Readonly<Record<Within, ReadonlyArray<Job>>> => {
  const id = (one: { readonly name: string; readonly key?: string }) =>
    `${one.name}\u0000${one.key ?? ''}`;
  const sends = (name: string, key?: string) =>
    sending?.address === node.address &&
    sending.worker === name &&
    (sending.key === undefined || sending.key === key);
  const started = new Set((change?.workers.started ?? []).map(id));
  const running = new Set(node.workers.map(id));
  const known = new Map(node.workers.map((one) => [one.name, one]));
  const rows = [
    ...node.workers.map((one) => ({
      ...one,
      mark: started.has(id(one)) ? ('started' as const) : null,
    })),
    ...(change?.workers.stopped ?? [])
      .filter(
        (one) => !running.has(id(one)) && (removed || sends(one.name, one.key)),
      )
      .map((one) => {
        const like = known.get(one.name);
        return {
          ...one,
          within: like?.within ?? ('always' as const),
          ...(like?.runs === undefined ? {} : { runs: like.runs }),
          mark: 'stopped' as const,
        };
      }),
  ];
  const jobs = new Map<string, Job>();
  const where = new Map<string, Within>();
  for (const row of rows) {
    if (!where.has(row.name)) where.set(row.name, row.within);
    const held = jobs.get(row.name) ?? {
      name: row.name,
      ...(row.runs === undefined ? {} : { runs: row.runs }),
      mark: null,
      sending: false,
      keys: [],
    };
    jobs.set(
      row.name,
      row.key === undefined
        ? { ...held, mark: row.mark, sending: sends(row.name) }
        : {
            ...held,
            sending: held.sending || sends(row.name, row.key),
            keys: [...held.keys, { key: row.key, mark: row.mark }],
          },
    );
  }
  const all = [...jobs.values()].map((job) =>
    job.keys.length === 0 ? job : { ...job, mark: markOf(job.keys) },
  );
  return {
    always: all.filter(({ name }) => where.get(name) === 'always'),
    state: all.filter(({ name }) => where.get(name) === 'state'),
  };
};

const sentBy = (
  node: Node,
  message: Played | null,
  sending: Sending | null,
): string | null =>
  message &&
  sending?.address === node.address &&
  message.to !== node.address &&
  sending.worker === undefined
    ? message.tag
    : null;

const payloadOf = (message: Played | null): ReadonlyArray<Field> =>
  message && isRecord(message.message)
    ? Object.entries(message.message)
        .filter(([key]) => key !== '_tag')
        .map(([key, value]) => ({ key, value, kind: 'same' }))
    : [];

const viaOf = (message: Played | null): string | null => {
  if (!message) return null;
  const { from } = message;
  switch (from.kind) {
    case 'emit':
      return `emits ${from.name}`;
    case 'command':
      return `${from.name} command`;
    case 'worker':
      return `${from.name} worker`;
    case 'provides':
      return 'capability';
    default:
      return null;
  }
};

export const boardOf = ({ model }: Data): Board | null => {
  const { stepped, removed } = model;
  if (!stepped) return null;
  const { message } = stepped;
  const changed = new Map<string, Changed>();
  const added = new Set<string>();
  const ghosts: Array<Node> = [];
  for (const change of stepped.changes) {
    if (change._tag === 'Changed') changed.set(change.address, change);
    else if (change._tag === 'Added') added.add(change.address);
    else if (removed) ghosts.push(ghostOf(change));
  }
  const gone = new Set(ghosts.map(({ address }) => address));
  const from = senderOf(message);
  const cardOf = (node: Node): Card => {
    const change = changed.get(node.address);
    const ghost = gone.has(node.address);
    const was =
      change?.state?.transition === true
        ? tagOf(change.state.before)
        : undefined;
    const jobs = jobsOf(node, change, removed || ghost, from);
    const name = node.slot ?? node.actor;
    return {
      node,
      name,
      type: name === node.actor ? null : node.actor,
      ghost,
      added: added.has(node.address),
      changed: change !== undefined,
      ...(was === undefined ? {} : { was }),
      target: message?.to === node.address,
      sent: sentBy(node, message, from),
      model: fieldsOf(node.model, change?.model ?? {}, removed),
      props: fieldsOf(node.props, change?.props ?? {}, removed),
      data: fieldsOf(node.data, dataChanges(change), removed),
      workers: jobs.always,
      stateWorkers: jobs.state,
      always: namesWithin(node, 'always'),
      inState: namesWithin(node, 'state'),
      children: node.children.map(cardOf),
    };
  };
  return {
    root: cardOf(withGhosts(stepped.tree, ghosts)),
    message,
    payload: payloadOf(message),
    sender:
      from && message && from.address !== message.to ? from.address : null,
    via: viaOf(message),
    compared: model.compared,
    loop:
      message?.from.kind === 'worker' && message.from.instance === message.to,
    key: `${stepped.at}:${removed}`,
  };
};

export const previewShown = ({ model }: Data): boolean =>
  model.previewing && model.now?.previewing !== null;

export const openedOf = ({ model }: Data): ReadonlyArray<string> =>
  model.opened === null ? [] : [model.opened];

export const worldOf = ({ model }: Data): ReadonlyArray<string> =>
  model.world && !model.presenting ? ['world'] : [];

export const instanceOf = ({ model }: Data) => ({
  at: model.shown,
  epoch: model.epoch,
  revision: model.now?.revision ?? 0,
});
