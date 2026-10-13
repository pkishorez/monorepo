import type {
  ProofLeaf,
  ProofReport,
  ProofVerdict,
  StoryNode,
} from 'laymos/story/schema';

/** The latest Proof report per Proof id. */
export type ProofReports = Readonly<Record<string, ProofReport>>;

/** `pending`: in a run under way, waiting its turn. */
export type ProofState = 'not-run' | 'pending' | 'running' | ProofVerdict;

/** Worst first: the order states are counted and shown in. */
export const proofStates = [
  'failed',
  'errored',
  'unprepared',
  'running',
  'pending',
  'passed',
  'not-run',
] as const satisfies readonly ProofState[];

const nonePending: ReadonlySet<string> = new Set();

export function proofState(
  id: string,
  reports: ProofReports,
  running: ReadonlySet<string>,
  pending: ReadonlySet<string> = nonePending,
): ProofState {
  if (running.has(id)) return 'running';
  if (pending.has(id)) return 'pending';
  return reports[id]?.verdict ?? 'not-run';
}

/** Whether a Proof in this state did not hold. */
export function isFailing(state: ProofState): boolean {
  return state === 'failed' || state === 'errored';
}

/** Every Proof in a Story and the Stories beneath it, in Telling order. */
export function proofsBeneath(story: StoryNode): readonly ProofLeaf[] {
  return [...story.proofs, ...story.stories.flatMap(proofsBeneath)];
}

export interface Tally {
  readonly counts: Readonly<Record<ProofState, number>>;
  readonly total: number;
  /** A Critical Proof beneath failed or errored. */
  readonly criticalFailing: boolean;
}

/** The Proof states rolled up from everything beneath a Story. */
export function tallyOf(
  story: StoryNode,
  reports: ProofReports,
  running: ReadonlySet<string>,
  pending: ReadonlySet<string> = nonePending,
): Tally {
  const counts: Record<ProofState, number> = {
    failed: 0,
    errored: 0,
    unprepared: 0,
    running: 0,
    pending: 0,
    passed: 0,
    'not-run': 0,
  };
  let criticalFailing = false;
  const proofs = proofsBeneath(story);
  for (const proof of proofs) {
    const state = proofState(proof.id, reports, running, pending);
    counts[state]++;
    if (proof.critical && isFailing(state)) criticalFailing = true;
  }
  return { counts, total: proofs.length, criticalFailing };
}

/**
 * The one result a Story shows for everything beneath it: `running` while
 * any Proof beneath runs, `pending` while any waits its turn in a run, `critical` when a Critical Proof failed,
 * `failing` when any Proof failed, errored or was unprepared, `passed`
 * when every Proof passed, and `not-run` otherwise.
 */
export type Rollup =
  | 'running'
  | 'pending'
  | 'critical'
  | 'failing'
  | 'passed'
  | 'not-run';

export function rollupOf(tally: Tally): Rollup {
  const { counts, total } = tally;
  if (counts.running > 0) return 'running';
  if (counts.pending > 0) return 'pending';
  if (tally.criticalFailing) return 'critical';
  if (counts.failed + counts.errored + counts.unprepared > 0) return 'failing';
  if (total > 0 && counts.passed === total) return 'passed';
  return 'not-run';
}

export interface ProofCounts {
  readonly total: number;
  readonly passed: number;
  /** Failed, errored or unprepared. */
  readonly failing: number;
}

/** How a Story's own Proofs, not those of its sub-Stories, last ran. */
export function ownProofCounts(
  story: StoryNode,
  reports: ProofReports,
  running: ReadonlySet<string>,
  pending: ReadonlySet<string> = nonePending,
): ProofCounts {
  let passed = 0;
  let failing = 0;
  for (const proof of story.proofs) {
    const state = proofState(proof.id, reports, running, pending);
    if (state === 'passed') passed++;
    else if (isFailing(state) || state === 'unprepared') failing++;
  }
  return { total: story.proofs.length, passed, failing };
}

/** The Stories from the top down to the one with `id`, both included. */
export function storyPath(
  story: StoryNode,
  id: string,
): readonly StoryNode[] | undefined {
  if (story.id === id) return [story];
  for (const child of story.stories) {
    const path = storyPath(child, id);
    if (path !== undefined) return [story, ...path];
  }
  return undefined;
}

/**
 * The Stories open once `id` opens: the one path from the top Story down to
 * it. Its siblings, and everything beneath them and beneath it, close.
 */
export function openPath(tree: StoryNode, id: string): ReadonlySet<string> {
  return new Set(storyPath(tree, id)?.map((story) => story.id));
}

/**
 * The Stories open once `id` collapses: it and everything beneath it close,
 * leaving the path down to its parent.
 */
export function closeAt(tree: StoryNode, id: string): ReadonlySet<string> {
  return new Set(
    storyPath(tree, id)
      ?.slice(0, -1)
      .map((story) => story.id),
  );
}

export interface LocatedProof {
  readonly proof: ProofLeaf;
  /** The Stories from the top down to the one the Proof sits in. */
  readonly path: readonly StoryNode[];
}

export function findProof(
  story: StoryNode,
  id: string,
): LocatedProof | undefined {
  const proof = story.proofs.find((leaf) => leaf.id === id);
  if (proof !== undefined) return { proof, path: [story] };
  for (const child of story.stories) {
    const found = findProof(child, id);
    if (found !== undefined) return { ...found, path: [story, ...found.path] };
  }
  return undefined;
}

/** Whether a Story id or Proof id falls inside a run's scope. */
export function inScope(id: string, scope: string | undefined): boolean {
  return scope === undefined || id === scope || id.startsWith(`${scope}/`);
}

export interface TreeIndex {
  readonly stories: ReadonlySet<string>;
  readonly proofs: ReadonlySet<string>;
}

export function indexTree(tree: StoryNode): TreeIndex {
  const stories = new Set<string>();
  const proofs = new Set<string>();
  const visit = (story: StoryNode) => {
    stories.add(story.id);
    for (const proof of story.proofs) proofs.add(proof.id);
    story.stories.forEach(visit);
  };
  visit(tree);
  return { stories, proofs };
}
