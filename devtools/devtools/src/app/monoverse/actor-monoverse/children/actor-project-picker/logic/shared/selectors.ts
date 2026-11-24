import {
  OPEN_FOLDER,
  type FolderStep,
  type Group,
  type Listing,
  type Model,
  type Ranked,
  type Row,
  type Shown,
} from './shape.js';

/*
 * What the top Step shows, and the paths and ranks it is worked out with.
 * Pure, so the Updates and the View read the same rows.
 *
 * 1. Recent  the saved Projects, best match first, then "Open a folder…",
 *            whatever the search, or first for a path: it goes to the
 *            folder Steps, searching what was typed, a path included.
 * 2. Folder  the top folder's sub-folders, best match first. A listing
 *            covers a longer search when it was not cut short and lists
 *            the same scope, hidden or not; any other search is asked of
 *            the server again.
 */

const PROJECT = 'project:';
export const projectValue = (id: string) => `${PROJECT}${id}`;

// Steps ----------------------------------------------------------------------

/** The top folder Step, or null on Recent. */
export const topOf = (model: Model): FolderStep | null =>
  model.folders.at(-1) ?? null;

export const queryOf = (model: Model) => topOf(model)?.query ?? model.query;

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

// Paths ----------------------------------------------------------------------

/** A path under home, written from `~`; others as they are. */
export function tilde(path: string, home: string | null): string {
  if (home !== null) {
    if (path === home) return '~';
    return path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
  }
  // Before the server has said where home is: the usual places.
  const match = /^\/Users\/[^/]+|^\/home\/[^/]+/.exec(path);
  return match ? `~${path.slice(match[0].length)}` : path;
}

/** The absolute folder `segments` below home. */
export const absolute = (home: string, segments: ReadonlyArray<string>) =>
  segments.length === 0 ? home : `${home}/${segments.join('/')}`;

/** Whether a search asks for hidden folders: it starts with a `.`. */
export const hiddenOf = (query: string) => query.trim().startsWith('.');

// Ranks ----------------------------------------------------------------------

/*
 * Which rows a search finds, best first, as the code app's Picker ranks
 * them: a label that starts with the search beats one that has it at a
 * word start, which beats one that has it anywhere, which beats one whose
 * letters merely appear in order; a detail that has it comes last. Ties go
 * to the shorter label. With no search, every row stays in the order it
 * was given. `matched` holds the label's matching character offsets, for
 * drawing them lit.
 */

interface Labelled {
  readonly label: string;
  readonly detail?: string | undefined;
}

export function rank<T extends Labelled>(
  entries: ReadonlyArray<T>,
  query: string,
): ReadonlyArray<Ranked<T>> {
  const wanted = query.trim().toLowerCase();
  if (wanted === '') return entries.map((entry) => ({ entry, matched: [] }));
  return entries
    .flatMap((entry) => {
      const found = score(entry, wanted);
      return found === null ? [] : [{ entry, ...found }];
    })
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        a.entry.label.length - b.entry.label.length ||
        a.entry.label.localeCompare(b.entry.label),
    )
    .map(({ entry, matched }) => ({ entry, matched }));
}

function score(
  { label, detail }: Labelled,
  wanted: string,
): { tier: number; matched: ReadonlyArray<number> } | null {
  const lower = label.toLowerCase();
  const run = (at: number) =>
    Array.from({ length: wanted.length }, (_, i) => at + i);
  if (lower.startsWith(wanted)) return { tier: 0, matched: run(0) };
  const atWord = wordStart(lower, wanted);
  if (atWord !== -1) return { tier: 1, matched: run(atWord) };
  const anywhere = lower.indexOf(wanted);
  if (anywhere !== -1) return { tier: 2, matched: run(anywhere) };
  const inOrder = subsequence(lower, wanted);
  if (inOrder !== null) return { tier: 3, matched: inOrder };
  if (detail?.toLowerCase().includes(wanted)) return { tier: 4, matched: [] };
  return null;
}

function wordStart(label: string, wanted: string): number {
  for (
    let at = label.indexOf(wanted);
    at !== -1;
    at = label.indexOf(wanted, at + 1)
  )
    if (at > 0 && /[-_:./\s]/.test(label.charAt(at - 1))) return at;
  return -1;
}

function subsequence(label: string, wanted: string): Array<number> | null {
  const matched: Array<number> = [];
  let at = 0;
  for (const letter of wanted) {
    at = label.indexOf(letter, at);
    if (at === -1) return null;
    matched.push(at++);
  }
  return matched;
}
