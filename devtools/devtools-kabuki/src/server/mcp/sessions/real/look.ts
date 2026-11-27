import type {
  Failed,
  Looked,
  Node,
  Stepped,
  Work,
  Worker,
} from '../../../rpc/session/contract/index.ts';
import { type NameOf, namesOf } from './names.ts';
import { named } from './signature.ts';
import { brief, dataOf, field, firstLines, seconds } from './text.ts';

const described = (opened: ReadonlyArray<Looked>) =>
  opened.some(({ takes }) =>
    takes.some(({ description }) => description !== undefined),
  );

const takesOf = ({ takes }: Looked, only: boolean) => {
  const all = [
    ...takes.filter(({ within }) => within === 'always'),
    ...takes.filter(({ within }) => within === 'state'),
  ];
  const shown = only
    ? all.filter(({ description }) => description !== undefined)
    : all;
  const internal = all.length - shown.length;
  return [
    ...shown.map(({ tag, payload, description }) =>
      named({
        name: tag,
        shape: payload,
        ...(description === undefined ? {} : { description }),
      }),
    ),
    ...(internal === 0 ? [] : [`+${internal} internal`]),
  ];
};

const workerName = ({ name, key }: { name: string; key?: string }) =>
  key === undefined || key === '' ? name : `${name}[${key}]`;

const failedKey = ({ address, kind, name, key, at }: Failed) =>
  `${address}|${kind}|${name}|${key ?? ''}|${at}`;

export const failuresOf = (work: Work | undefined) =>
  new Set((work?.failures ?? []).map(failedKey));

export const newFailures = (
  work: Work | undefined,
  known: ReadonlySet<string>,
) => (work?.failures ?? []).filter((one) => !known.has(failedKey(one)));

export const failedLine = (one: Failed, name: NameOf) =>
  `${name(one.address)}: ${one.kind === 'layer' ? 'layer' : `${one.kind} ${workerName(one)}`} failed @${seconds(one.at)}: ${firstLines(one.failure)}`;

const workerLine = (worker: Worker) =>
  worker.status === 'failed'
    ? `worker ${workerName(worker)} failed @${seconds(worker.since)}: ${firstLines(worker.failure ?? '')}`
    : `worker ${workerName(worker)} waiting for its Capabilities`;

export const problemsOf = (work: Work, name: NameOf) => {
  const lines: Array<string> = [];
  const shown = new Set<string>();
  if (work.layer !== undefined && work.layer.status !== 'built')
    lines.push(
      work.layer.status === 'failed'
        ? `layer failed: ${firstLines(work.layer.failure ?? '')}`
        : 'layer building',
    );
  for (const [address, working] of Object.entries(work.instances)) {
    const who = name(address);
    for (const worker of working.workers)
      if (worker.status === 'failed' || worker.status === 'waiting') {
        if (worker.status === 'failed')
          shown.add(`${address}|worker|${worker.name}|${worker.key}`);
        lines.push(`${who}: ${workerLine(worker)}`);
      }
    for (const provided of working.provides)
      if (provided.status !== 'built')
        lines.push(
          `${who}: provides${provided.state === undefined ? '' : ` in ${provided.state}`} ${provided.status}${provided.failure === undefined ? '' : `: ${firstLines(provided.failure)}`}`,
        );
    for (const command of working.commands)
      lines.push(
        `${who}: command ${command.name} running since @${seconds(command.since)} ${brief(command.args, 40).text}`,
      );
  }
  for (const one of work.failures)
    if (
      one.kind !== 'layer' &&
      !shown.has(`${one.address}|${one.kind}|${one.name}|${one.key ?? ''}`)
    )
      lines.push(failedLine(one, name));
  return lines;
};

const stateOf = (state: string) => (state === 'Single' ? '' : ` [${state}]`);

const statusesOf = (workers: Looked['workers']) =>
  workers
    .map(({ live, ...asked }) =>
      live === undefined
        ? workerName(asked)
        : `${workerName(asked)} ${live.status}`,
    )
    .join(', ');

const openedText = (title: string, looked: Looked, only: boolean) => {
  const data = dataOf(looked.data);
  const taken = takesOf(looked, only);
  return [
    `${title}${stateOf(looked.state)}`,
    ...(looked.description === undefined
      ? []
      : [`  about: ${looked.description}`]),
    ...(data === undefined ? [] : [field('data', data, 1)]),
    field('model', looked.model, 1),
    ...(looked.props === undefined ? [] : [field('props', looked.props, 1)]),
    ...(looked.workers.length === 0
      ? []
      : [`  workers: ${statusesOf(looked.workers)}`]),
    ...(taken.length === 0
      ? []
      : ['  takes:', ...taken.map((one) => `    ${one}`)]),
  ].join('\n');
};

export interface Shown {
  readonly stepped: Stepped;
  readonly models: Readonly<Record<string, unknown>>;
  readonly opened: ReadonlyArray<Looked>;
}

export const treeOf = (
  root: Node,
  models: Readonly<Record<string, unknown>>,
) => {
  let cut = false;
  const lines = namesOf(root).map(({ node, depth, name }) => {
    const model = models[node.address];
    const shown =
      model === undefined ||
      (typeof model === 'object' &&
        model !== null &&
        Object.keys(model).length === 0)
        ? undefined
        : brief(model);
    if (shown?.cut === true) cut = true;
    return `${'  '.repeat(depth)}${name}${stateOf(node.state)}${shown === undefined ? '' : `  ${shown.text}`}`;
  });
  return { lines, cut };
};

export const lookOf = ({ stepped, models, opened }: Shown, name: NameOf) => {
  const { lines, cut } = treeOf(stepped.tree, models);
  const { work } = stepped;
  const problems = work === undefined ? [] : problemsOf(work, name);
  const only = described(opened);
  const whole = opened.map((one) => openedText(name(one.address), one, only));
  return [
    `at ${stepped.at}${work === undefined ? ' (a past step: no Work report)' : ` (head), ${work.settled ? 'settled' : 'not settled'}`}`,
    ...(problems.length === 0
      ? []
      : ['problems:', ...problems.map((one) => `  ${one}`)]),
    ...(whole.length > 0
      ? whole
      : [
          ...lines,
          ...(cut
            ? [
                '… cut: open: [name] gives the whole Model and the Messages it takes',
              ]
            : []),
        ]),
  ].join('\n');
};
