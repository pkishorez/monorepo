import type { Plan, Shape } from '@kestack/devtools-kabuki/devtools';
import { KINDS, LEVELLED, SHAPED, STATE } from '../index.js';
import type { Kind } from '../index.js';
import { rowsOf } from './shape.js';

export interface Item {
  readonly kind: Kind;
  readonly name: string;
  readonly level: string | null;
}

export const plansOf = (root: Plan): ReadonlyArray<Plan> => [
  root,
  ...root.children.flatMap(({ plan }) => plansOf(plan)),
];

export const planAt = (root: Plan, path: string): Plan | null =>
  plansOf(root).find((plan) => plan.path === path) ?? null;

export const statesOf = (plan: Plan): ReadonlyArray<string> =>
  plan.states.some(({ tag }) => tag !== 'Single')
    ? plan.states.map(({ tag }) => tag)
    : [];

export const itemsOf = (plan: Plan, kind: Kind): ReadonlyArray<Item> => {
  switch (kind) {
    case 'worker':
      return plan.workers.map(({ name, state }) => ({
        kind,
        name,
        level: state ?? null,
      }));
    case 'message':
      return plan.messages.map(({ tag, state }) => ({
        kind,
        name: tag,
        level: state ?? null,
      }));
    case 'child':
      return plan.children.map(({ name, state }) => ({
        kind,
        name,
        level: state ?? null,
      }));
  }
};

export const idOf = ({ kind, name, level }: Item) =>
  level === null ? `${kind}:${name}` : `state:${level}/${kind}:${name}`;

export const refOf = (plan: Plan, item: Item) =>
  itemsOf(plan, item.kind).filter(({ name }) => name === item.name).length > 1
    ? idOf(item)
    : `${item.kind}:${item.name}`;

export const payloadOf = (plan: Plan, item: Item): Shape | undefined =>
  plan.messages.find(
    ({ tag, state }) => tag === item.name && (state ?? null) === item.level,
  )?.payload;

export const dataOf = (plan: Plan, tag: string): Shape | undefined =>
  plan.states.find((state) => state.tag === tag)?.data;

const filled = (shape: Shape | undefined) =>
  shape !== undefined && rowsOf(shape).length > 0;

const keyed = (shape: Shape | undefined, path: string | undefined) =>
  path === undefined ||
  (shape !== undefined && rowsOf(shape).some(({ id }) => id === path));

const EMIT = /^emits:([^/.]+)$/;
const LISTS = ['requires', 'provides', 'queries'] as const;

export const resolve = (plan: Plan, ref: string): ReadonlyArray<string> => {
  const levelled = LEVELLED.exec(ref);
  if (levelled) {
    const [, level, kind, name, path] = levelled;
    if (path !== undefined && kind !== 'message') return [];
    return itemsOf(plan, kind as Kind)
      .filter(
        (item) =>
          item.name === name && (level === undefined || item.level === level),
      )
      .filter((item) => keyed(payloadOf(plan, item), path))
      .map((item) => `${idOf(item)}${path === undefined ? '' : `.${path}`}`);
  }
  const shaped = SHAPED.exec(ref);
  if (shaped) {
    const [, part, path] = shaped;
    const shape = plan[part as 'model' | 'input' | 'props'];
    return filled(shape) && keyed(shape, path) ? [ref] : [];
  }
  const state = STATE.exec(ref);
  if (state) {
    const [, tag = '', path] = state;
    return statesOf(plan).includes(tag) && keyed(dataOf(plan, tag), path)
      ? [ref]
      : [];
  }
  const emit = EMIT.exec(ref);
  if (emit) return plan.emits.some(({ tag }) => tag === emit[1]) ? [ref] : [];
  switch (ref) {
    case 'description':
      return plan.description === undefined ? [] : [ref];
    case 'requires':
    case 'provides':
    case 'queries':
      return plan[ref].length > 0 ? [ref] : [];
    default:
      return [];
  }
};

const keysUnder = (prefix: string, shape: Shape | undefined) =>
  shape === undefined ? [] : rowsOf(shape).map(({ id }) => `${prefix}.${id}`);

export const refsOf = (plan: Plan): ReadonlyArray<string> => [
  ...(plan.description === undefined ? [] : ['description']),
  ...(['model', 'input', 'props'] as const).flatMap((part) =>
    filled(plan[part]) ? [part, ...keysUnder(part, plan[part])] : [],
  ),
  ...statesOf(plan).flatMap((tag) => [
    `state:${tag}`,
    ...keysUnder(`state:${tag}`, dataOf(plan, tag)),
  ]),
  ...KINDS.flatMap((kind) =>
    itemsOf(plan, kind).flatMap((item) => {
      const ref = refOf(plan, item);
      return kind === 'message'
        ? [ref, ...keysUnder(ref, payloadOf(plan, item))]
        : [ref];
    }),
  ),
  ...plan.emits.map(({ tag }) => `emits:${tag}`),
  ...LISTS.filter((list) => plan[list].length > 0),
];

export const slotOf = (plan: Plan) => {
  const last = plan.path.split('/').at(-1) ?? plan.path;
  return (last.split(':').at(-1) ?? last) === plan.actor ? null : last;
};

export const chipOf = (path: string, ref?: string) =>
  ref === undefined ? path : `${path} · ${ref}`;
