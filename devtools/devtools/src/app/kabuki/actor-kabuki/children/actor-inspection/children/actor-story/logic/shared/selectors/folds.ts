import type { Plan, Shape } from '@kestack/devtools-kabuki/devtools';
import { dataOf, itemsOf, statesOf } from './blueprint.js';
import { KINDS, LEVELLED, SECTION_OF, SHAPED, STATE } from '../index.js';
import type { Kind, Section } from '../index.js';
import { rowsOf } from './shape.js';

export const sectionId = (level: string | null, section: Section) =>
  level === null ? section : `state:${level}/${section}`;

export const parentsOf = (shape: Shape | undefined) => {
  const ids = shape === undefined ? [] : rowsOf(shape).map(({ id }) => id);
  return ids.filter((id) => ids.some((other) => other.startsWith(`${id}.`)));
};

const pathTo = (base: string, path: string | undefined) => {
  if (path === undefined) return [];
  const parts = path.split('.');
  return parts.map((_, at) => `${base}.${parts.slice(0, at + 1).join('.')}`);
};

const holding = (plan: Plan, id: string): ReadonlyArray<string> => {
  const levelled = LEVELLED.exec(id);
  if (levelled) {
    const [, level, kind] = levelled;
    const section = sectionId(level ?? null, SECTION_OF[kind as Kind]);
    return level === undefined ? [section] : [`state:${level}`, section];
  }
  const shaped = SHAPED.exec(id);
  if (shaped) {
    const [, part = '', path] = shaped;
    return [...(part === 'model' ? [] : [part]), ...pathTo(part, path)];
  }
  const state = STATE.exec(id);
  if (state) {
    const [, tag = '', path] = state;
    return [`state:${tag}`, ...pathTo(`state:${tag}`, path)];
  }
  if (id.startsWith('emits:')) return ['emits'];
  if (id === 'provides' || id === 'queries')
    return [
      id,
      ...plan[id].flatMap(({ state }) =>
        state === undefined ? [] : [`state:${state}`, sectionId(state, id)],
      ),
    ];
  return id === 'requires' ? [id] : [];
};

export const opensOf = (
  plan: Plan,
  ids: Iterable<string>,
): ReadonlySet<string> => new Set([...ids].flatMap((id) => holding(plan, id)));

const sectionsAt = (plan: Plan, level: string | null) => {
  const here = (state: string | undefined) => (state ?? null) === level;
  const sections: ReadonlyArray<Section> = [
    ...KINDS.filter((kind) =>
      itemsOf(plan, kind).some((item) => item.level === level),
    ).map((kind) => SECTION_OF[kind]),
    ...(plan.provides.some(({ state }) => here(state))
      ? (['provides'] as const)
      : []),
    ...(plan.queries.some(({ state }) => here(state))
      ? (['queries'] as const)
      : []),
  ];
  return sections.map((section) => sectionId(level, section));
};

export const foldsOf = (plan: Plan): ReadonlySet<string> =>
  new Set([
    ...sectionsAt(plan, null),
    ...(plan.emits.length > 0 ? ['emits'] : []),
    ...(plan.requires.length > 0 ? ['requires'] : []),
    ...(['input', 'props'] as const).filter(
      (part) => plan[part] !== undefined && rowsOf(plan[part]).length > 0,
    ),
    ...(['model', 'input', 'props'] as const).flatMap((part) =>
      parentsOf(plan[part]).map((id) => `${part}.${id}`),
    ),
    ...statesOf(plan).flatMap((tag) => [
      `state:${tag}`,
      ...sectionsAt(plan, tag),
      ...parentsOf(dataOf(plan, tag)).map((id) => `state:${tag}.${id}`),
    ]),
  ]);
