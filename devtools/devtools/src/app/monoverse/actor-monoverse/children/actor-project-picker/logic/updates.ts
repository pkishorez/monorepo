import type { InitOf, UpdatesOf } from '@kestack/kabuki/types';

import { add, remove } from './commands.js';
import {
  firstOf,
  highlightedOf,
  listingOf,
  projectAt,
  sameSegments,
  valuesOf,
  walk,
} from './selectors.js';
import {
  OPEN_FOLDER,
  shownOf,
  topOf,
  type FolderStep,
  type Listing,
  type Model,
  type ProjectPickerShape,
} from './shared/index.js';

const withTop = (
  model: Model,
  patch: Partial<Pick<FolderStep, 'query' | 'highlighted' | 'listing'>>,
): Model => {
  const top = topOf(model);
  if (top === null)
    return {
      ...model,
      ...(patch.query === undefined ? {} : { query: patch.query }),
      ...(patch.highlighted === undefined
        ? {}
        : { highlighted: patch.highlighted }),
    };
  return {
    ...model,
    folders: [...model.folders.slice(0, -1), { ...top, ...patch }],
  };
};

const highlighted = (
  model: Model,
  keep: false | { readonly before: string | undefined },
): Model => {
  const values = valuesOf(model);
  const now = highlightedOf(model);
  const kept = keep !== false && now !== keep.before && values.includes(now);
  return withTop(model, { highlighted: kept ? now : (values[0] ?? '') });
};

const moved = (model: Model, by: number): Model => {
  const values = valuesOf(model);
  if (values.length === 0) return model;
  const at = values.indexOf(highlightedOf(model));
  const from = at === -1 ? (by > 0 ? -1 : 0) : at;
  const next = (((from + by) % values.length) + values.length) % values.length;
  return withTop(model, { highlighted: values[next] ?? '' });
};

const highlightedTo = (model: Model, value: string) =>
  withTop(model, { highlighted: value });

const stackTo = (
  model: Model,
  segments: ReadonlyArray<string>,
  query: string,
): Model => {
  const folders = Array.from({ length: segments.length + 1 }, (_, depth) => {
    const at = segments.slice(0, depth);
    const old = model.folders[depth];
    return old !== undefined && sameSegments(old.segments, at)
      ? old
      : {
          segments: at,
          query: '',
          highlighted: '',
          listing: depth === 0 ? model.homeListing : null,
        };
  });
  const top = folders.at(-1)!;
  folders[folders.length - 1] = { ...top, query, highlighted: '' };
  return { ...model, folders };
};

const typed = (model: Model, query: string): Model => {
  const top = topOf(model);
  const gone = top === null ? null : walk(top.segments, query, model.home);
  const next =
    gone === null
      ? withTop(model, { query })
      : stackTo(model, gone.segments, gone.query);
  return highlighted({ ...next, problem: null }, false);
};

const openFolders = (model: Model): Model =>
  typed(stackTo(model, [], ''), model.query.trim());

const into = (model: Model, name: string): Model => {
  const top = topOf(model);
  if (top === null) return model;
  return highlighted(
    {
      ...model,
      folders: [
        ...model.folders,
        {
          segments: [...top.segments, name],
          query: '',
          highlighted: '',
          listing: null,
        },
      ],
      problem: null,
    },
    false,
  );
};

const backTo = (model: Model, depth: number): Model =>
  depth >= model.folders.length || depth < 0
    ? model
    : { ...model, folders: model.folders.slice(0, depth), problem: null };

const loaded = (
  model: Model,
  segments: ReadonlyArray<string>,
  listing: Listing,
): Model => {
  const top = topOf(model);
  if (top === null || !sameSegments(top.segments, segments)) return model;
  const before = firstOf(model);
  return highlighted(withTop(model, { listing }), { before });
};

const onRecent = (model: Model, value: string) => {
  if (value === OPEN_FOLDER) return { model: openFolders(model) };
  const project = projectAt(model, value);
  return project === null ? {} : { emit: { _tag: 'Picked' as const, project } };
};

export const init: InitOf<typeof ProjectPickerShape> = ({ current }) => ({
  model: {
    current,
    home: null,
    homeListing: null,
    recent: null,
    recentProblem: null,
    query: '',
    highlighted: '',
    folders: [],
    removing: [],
    adding: null,
    problem: null,
  },
});

export const updates: UpdatesOf<typeof ProjectPickerShape> = {
  Typed: ({ query }, { model }) =>
    model.adding !== null ? {} : { model: typed(model, query) },
  Moved: ({ by }, { model }) => ({ model: moved(model, by) }),
  Highlighted: ({ value }, { model }) => ({
    model: highlightedTo(model, value),
  }),
  Picked: ({ value }, { model }) => {
    if (model.adding !== null) return {};
    if (topOf(model) === null) return onRecent(model, value);
    const row = shownOf(model, null).rows.find((each) => each.value === value);
    return row?._tag === 'Folder'
      ? { model: into(model, row.folder.name) }
      : {};
  },
  Chose: ({ on }, { model }) => {
    if (model.adding !== null) return {};
    if (topOf(model) === null) return on === null ? {} : onRecent(model, on);
    const shown = shownOf(model, null);
    const row =
      on === null ? null : shown.rows.find((each) => each.value === on);
    const path =
      row?._tag === 'Folder' ? row.folder.path : (shown.where?.path ?? null);
    return path === null
      ? {}
      : {
          model: { ...model, adding: path, problem: null },
          command: add({ path }),
        };
  },
  Added: ({ project }, { model }) => ({
    model: {
      ...model,
      adding: null,
      recent: [
        project,
        ...(model.recent ?? []).filter(({ id }) => id !== project.id),
      ],
    },
    emit: { _tag: 'Picked', project },
  }),
  AddRefused: ({ problem }, { model }) => ({
    model: { ...model, adding: null, problem },
  }),
  WentBack: (_, { model }) => ({
    model: backTo(model, model.folders.length - 1),
  }),
  WentBackTo: ({ depth }, { model }) => ({ model: backTo(model, depth) }),
  Dismissed: () => ({ emit: { _tag: 'Dismissed' } }),
  RemoveAsked: ({ id }, { model }) => {
    if (model.removing.includes(id) || topOf(model) !== null) return {};
    const before = shownOf(model, null).rows.map(({ value }) => value);
    const at = before.indexOf(model.highlighted);
    const next: Model = {
      ...model,
      removing: [...model.removing, id],
      problem: null,
    };
    const after = shownOf(next, null).rows.map(({ value }) => value);
    const kept = after.includes(model.highlighted)
      ? model.highlighted
      : (after[Math.min(Math.max(at, 0), after.length - 1)] ?? '');
    return {
      model: { ...next, highlighted: kept },
      command: remove({ id }),
    };
  },
  Removed: ({ id }, { model }) => ({
    model: {
      ...model,
      recent: model.recent?.filter((project) => project.id !== id) ?? null,
      removing: model.removing.filter((each) => each !== id),
    },
  }),
  RemoveRefused: ({ id, problem }, { model }) => ({
    model: {
      ...model,
      removing: model.removing.filter((each) => each !== id),
      problem,
    },
  }),
  RecentRead: ({ projects }, { model }) => {
    const before = topOf(model) === null ? firstOf(model) : undefined;
    const read = { ...model, recent: projects, recentProblem: null };
    return {
      model: topOf(model) === null ? highlighted(read, { before }) : read,
    };
  },
  RecentRefused: ({ problem }, { model }) => ({
    model: { ...model, recentProblem: problem },
  }),
  Retried: (_, { model }) => ({
    model: { ...model, recentProblem: null },
  }),
  HomeFound: ({ listing }, { model }) => {
    const home = listingOf(listing, '', false);
    const read: Model = { ...model, home: listing.home, homeListing: home };
    const first = model.folders[0];
    if (first === undefined || first.listing !== null) return { model: read };
    return {
      model:
        model.folders.length === 1
          ? loaded(read, [], home)
          : {
              ...read,
              folders: [{ ...first, listing: home }, ...model.folders.slice(1)],
            },
    };
  },
  Loaded: ({ segments, listing, home }, { model }) => ({
    model: loaded({ ...model, home: home ?? model.home }, segments, listing),
  }),
};
