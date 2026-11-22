import type { Folder, ProjectEntry } from '../../contract/index.js';
import type { FolderStep, Kind, Listing, Model } from './model.js';
import { absolute, hiddenOf, tilde, walk } from './path.js';
import { rank, type Ranked } from './rank.js';

/*
 * What the top Step shows, and how each move changes the Steps. Pure, so
 * the actor's Update and the View read the same rows.
 *
 * 1. Recent  the saved Projects, best match first, then "Open a folder…",
 *            whatever the search, or first for a path: it goes to the
 *            folder Steps, searching what was typed, a path included.
 * 2. Folder  the top folder's sub-folders, best match first. A listing
 *            covers a longer search when it was not cut short and lists
 *            the same scope, hidden or not; any other search is asked of
 *            the server again.
 * 3. Moves   typing, going into a folder, back, and the highlight, which
 *            follows the best row until the keys or the mouse move it.
 */

/** The value of the pinned row that goes to the folder Steps. */
export const OPEN_FOLDER = 'open-folder';

const PROJECT = 'project:';
export const projectValue = (id: string) => `${PROJECT}${id}`;

export type Row =
  | {
      readonly _tag: 'Project';
      readonly value: string;
      readonly label: string;
      readonly detail: string;
      readonly project: ProjectEntry;
      readonly current: boolean;
    }
  | {
      readonly _tag: 'OpenFolder';
      readonly value: string;
      readonly label: string;
      readonly detail: string;
    }
  | {
      readonly _tag: 'Folder';
      readonly value: string;
      readonly label: string;
      readonly folder: Folder;
    };

export interface Group {
  readonly heading: string | null;
  readonly rows: ReadonlyArray<Ranked<Row>>;
}

export interface Shown {
  readonly step: 'recent' | 'folder';
  readonly groups: ReadonlyArray<Group>;
  /** Every row, as drawn. */
  readonly rows: ReadonlyArray<Row>;
  readonly loading: boolean;
  /** Why the rows could not be read. */
  readonly problem: string | null;
  /** Said where there are no rows, and a hint under it. */
  readonly empty: string | null;
  readonly hint: string | null;
  readonly placeholder: string;
  /** More folders matched than were listed. */
  readonly truncated: boolean;
  /** The folder open, on a folder Step. */
  readonly where: {
    readonly crumbs: ReadonlyArray<string>;
    /** Absolute; null until home is known, or when it cannot be read. */
    readonly path: string | null;
    readonly kind: Kind;
  } | null;
}

// Steps ----------------------------------------------------------------------

/** The top folder Step, or null on Recent. */
export const topOf = (model: Model): FolderStep | null =>
  model.folders.at(-1) ?? null;

export const queryOf = (model: Model) => topOf(model)?.query ?? model.query;

const highlightedOf = (model: Model) =>
  topOf(model)?.highlighted ?? model.highlighted;

/** The Model with the top Step changed. */
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

const sameSegments = (a: ReadonlyArray<string>, b: ReadonlyArray<string>) =>
  a.length === b.length && a.every((name, at) => name === b[at]);

/** Whether `listing` answers `query`, there or by narrowing what it holds. */
export const covers = (listing: Listing, query: string) => {
  const wanted = query.trim();
  if (listing.hidden !== hiddenOf(wanted)) return false;
  if (listing.query === wanted) return true;
  return (
    listing.problem === null &&
    !listing.truncated &&
    wanted.toLowerCase().includes(listing.query.toLowerCase())
  );
};

/** Whether the folder Step waits for the server. */
export const waits = (step: FolderStep) =>
  step.listing === null || !covers(step.listing, step.query);

// 1. Recent, 2. Folder -------------------------------------------------------

export function shownOf(model: Model, current: string | null): Shown {
  const top = topOf(model);
  return top === null ? recentShown(model, current) : folderShown(model, top);
}

function recentShown(model: Model, current: string | null): Shown {
  const query = model.query.trim();
  const live = (model.recent ?? []).filter(
    ({ id }) => !model.removing.includes(id),
  );
  const ranked = rank(
    live.map((project): Row => ({
      _tag: 'Project',
      value: projectValue(project.id),
      label: project.name,
      detail: tilde(project.path, model.home),
      project,
      current: project.id === current,
    })),
    query,
  );
  const open: Row = {
    _tag: 'OpenFolder',
    value: OPEN_FOLDER,
    label: 'Open a folder…',
    detail:
      query === ''
        ? 'Add a monorepo or package from your home folder'
        : query.includes('/')
          ? `Go to ${query}`
          : `Look for “${query}” under ~`,
  };
  const recent: ReadonlyArray<Group> =
    ranked.length > 0 ? [{ heading: 'Recent', rows: ranked }] : [];
  const pinned: Group = { heading: null, rows: [{ entry: open, matched: [] }] };
  // A path typed means a folder: Enter goes there, before any Project
  // whose folder it names.
  const groups = query.includes('/')
    ? [pinned, ...recent]
    : [...recent, pinned];
  const read = model.recent !== null;
  return {
    step: 'recent',
    groups,
    rows: groups.flatMap(({ rows }) => rows.map(({ entry }) => entry)),
    loading: !read && model.recentProblem === null,
    problem: model.recentProblem,
    empty: !read
      ? null
      : live.length === 0
        ? 'No projects yet'
        : ranked.length === 0
          ? `No project matching “${query}”`
          : null,
    hint:
      read && live.length === 0 ? 'Open a folder to add your first one.' : null,
    placeholder: 'Search projects, or type a path',
    truncated: false,
    where: null,
  };
}

function folderShown(model: Model, top: FolderStep): Shown {
  const query = top.query.trim();
  const { listing } = top;
  const waiting = waits(top);
  const ranked = rank(
    (listing?.folders ?? []).map((folder): Row => ({
      _tag: 'Folder',
      value: folder.path,
      label: folder.name,
      folder,
    })),
    query,
  );
  const problem =
    !waiting && listing !== null && listing.problem !== null
      ? listing.problem
      : null;
  const none = !waiting && problem === null && ranked.length === 0;
  const name = top.segments.at(-1);
  return {
    step: 'folder',
    groups: ranked.length > 0 ? [{ heading: null, rows: ranked }] : [],
    rows: ranked.map(({ entry }) => entry),
    loading: waiting,
    problem,
    empty: !none
      ? null
      : query === ''
        ? 'No folders here'
        : query.includes('/')
          ? 'Only folders under ~ can be opened'
          : `No folder matching “${query}”`,
    hint:
      none && !hiddenOf(query) && !query.includes('/')
        ? 'Start the search with . to see hidden folders.'
        : null,
    placeholder:
      name === undefined
        ? 'Search your home folder, or type a path'
        : `Search ${name}, or type a path`,
    truncated: !waiting && listing !== null && listing.truncated,
    where: {
      crumbs: ['~', ...top.segments],
      // Never a folder that could not be read.
      path:
        listing !== null && listing.problem !== null
          ? null
          : listing !== null
            ? listing.path
            : model.home === null
              ? null
              : absolute(model.home, top.segments),
      kind: listing?.kind ?? null,
    },
  };
}

// 3. Moves -------------------------------------------------------------------

const valuesOf = (model: Model) =>
  shownOf(model, null).rows.map(({ value }) => value);

/**
 * The highlight on the best row, or, with `keep`, where it is while that
 * row is still shown and was moved there, never left on a row that was
 * only the best before.
 */
export const highlighted = (
  model: Model,
  keep: false | { readonly before: string | undefined },
): Model => {
  const values = valuesOf(model);
  const now = highlightedOf(model);
  const kept = keep !== false && now !== keep.before && values.includes(now);
  return withTop(model, { highlighted: kept ? now : (values[0] ?? '') });
};

/** The highlight `by` rows on, round from the last to the first. */
export const moved = (model: Model, by: number): Model => {
  const values = valuesOf(model);
  if (values.length === 0) return model;
  const at = values.indexOf(highlightedOf(model));
  const from = at === -1 ? (by > 0 ? -1 : 0) : at;
  const next = (((from + by) % values.length) + values.length) % values.length;
  return withTop(model, { highlighted: values[next] ?? '' });
};

export const highlightedTo = (model: Model, value: string) =>
  withTop(model, { highlighted: value });

/** The first row now, for `highlighted` to tell a moved highlight from a best one. */
export const firstOf = (model: Model) => valuesOf(model)[0];

/**
 * The folder Steps from home down to `segments`, the top one searching
 * `query`: a Step already open on the way is kept as it was.
 */
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

/** `query` typed in the top Step: searched, or gone to the folder its path names. */
export const typed = (model: Model, query: string): Model => {
  const top = topOf(model);
  const gone = top === null ? null : walk(top.segments, query, model.home);
  const next =
    gone === null
      ? withTop(model, { query })
      : stackTo(model, gone.segments, gone.query);
  return highlighted({ ...next, problem: null }, false);
};

/** From Recent to home, searching what was typed there, a path included. */
export const openFolders = (model: Model): Model =>
  typed(stackTo(model, [], ''), model.query.trim());

/** Into the sub-folder `name` of the top Step. */
export const into = (model: Model, name: string): Model => {
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

/** Down to `depth` folder Steps, 0 being Recent. */
export const backTo = (model: Model, depth: number): Model =>
  depth >= model.folders.length || depth < 0
    ? model
    : { ...model, folders: model.folders.slice(0, depth), problem: null };

/** The listing the server gave for the top Step, if it is still the top. */
export const loaded = (
  model: Model,
  segments: ReadonlyArray<string>,
  listing: Listing,
): Model => {
  const top = topOf(model);
  if (top === null || !sameSegments(top.segments, segments)) return model;
  const before = firstOf(model);
  return highlighted(withTop(model, { listing }), { before });
};
