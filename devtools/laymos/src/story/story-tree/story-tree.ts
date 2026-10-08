import type { ProofLeaf, StoryNode, TellingIssue } from '../schema/index.js';
import { parseTelling, type Telling } from './telling.js';

/** One folder beneath the Stories path, as read from disk. */
export interface StoryFolder {
  /** The folder beneath the Stories path, `/`-separated; empty for the top Story. */
  readonly path: string;
  /** The content of its `story.md`; `null` when there is none. */
  readonly telling: string | null;
  /** The Proofs directly in it, each named by its file name without `.proof.ts(x)`. */
  readonly proofs: readonly Omit<ProofLeaf, 'id'>[];
}

/** A Story's id: the top Story's id, then the folder path beneath the Stories path. */
export function storyIdOf(top: string, path: string): string {
  return path === '' ? top : `${top}/${path}`;
}

/** A Proof's id: its Story's id plus the Proof's own name. */
export function proofIdOf(top: string, path: string, name: string): string {
  return `${storyIdOf(top, path)}/${name}`;
}

/**
 * Builds the Story tree from its folders. `top` is the top Story's id, the
 * Project's folder name. Folders missing from `folders` but implied by a
 * deeper one are Stories without a Telling.
 */
export function buildStoryTree(
  top: string,
  folders: readonly StoryFolder[],
): StoryNode {
  const byPath = new Map<string, StoryFolder>([
    ['', { path: '', telling: null, proofs: [] }],
  ]);
  for (const folder of folders) {
    for (const ancestor of ancestorsOf(folder.path)) {
      if (!byPath.has(ancestor)) {
        byPath.set(ancestor, { path: ancestor, telling: null, proofs: [] });
      }
    }
    byPath.set(folder.path, folder);
  }
  const known = new Set<string>();
  for (const folder of byPath.values()) {
    known.add(storyIdOf(top, folder.path));
    for (const proof of folder.proofs) {
      known.add(proofIdOf(top, folder.path, proof.name));
    }
  }
  const childrenOf = (path: string) =>
    [...byPath.keys()].filter(
      (candidate) => candidate !== '' && parentOf(candidate) === path,
    );

  const build = (path: string): StoryNode => {
    const folder = byPath.get(path)!;
    const id = storyIdOf(top, path);
    const name = path === '' ? top : path.slice(path.lastIndexOf('/') + 1);
    const telling: Telling | null =
      folder.telling === null ? null : parseTelling(folder.telling);
    const links = telling?.links ?? [];
    const stories = inTellingOrder(childrenOf(path).map(build), links);
    const proofs = inTellingOrder(
      folder.proofs.map((proof): ProofLeaf => ({
        ...proof,
        id: proofIdOf(top, path, proof.name),
      })),
      links,
    );
    return {
      id,
      name,
      path,
      title: telling?.title ?? name,
      pitch: telling?.pitch ?? '',
      body: telling?.body ?? '',
      stories,
      proofs,
      issues: issuesOf(telling, stories, links, known),
    };
  };

  return build('');
}

/** Keeps the part of the tree a scope covers: the scoped Story or Proof, its ancestors, and everything beneath. `null` when nothing matches. */
export function narrowStoryTree(
  tree: StoryNode,
  scope: string,
): StoryNode | null {
  if (covers(scope, tree.id)) return tree;
  if (!covers(tree.id, scope)) return null;
  const stories = tree.stories.flatMap((story) => {
    const narrowed = narrowStoryTree(story, scope);
    return narrowed === null ? [] : [narrowed];
  });
  const proofs = tree.proofs.filter(({ id }) => id === scope);
  if (stories.length === 0 && proofs.length === 0) return null;
  return { ...tree, stories, proofs };
}

/** Every Proof in the tree, depth first in Telling order. */
export function proofsOf(tree: StoryNode): readonly ProofLeaf[] {
  return [...tree.proofs, ...tree.stories.flatMap(proofsOf)];
}

/** Every Story in the tree, the top Story first. */
export function storiesOf(tree: StoryNode): readonly StoryNode[] {
  return [tree, ...tree.stories.flatMap(storiesOf)];
}

function covers(scope: string, id: string): boolean {
  return id === scope || id.startsWith(`${scope}/`);
}

function issuesOf(
  telling: Telling | null,
  stories: readonly StoryNode[],
  links: readonly string[],
  known: ReadonlySet<string>,
): TellingIssue[] {
  if (telling === null) {
    return [
      {
        kind: 'missing-telling',
        target: null,
        message: 'This Story has no story.md.',
      },
    ];
  }
  const issues: TellingIssue[] = [];
  const missing = [
    ...(telling.title === null ? ['a # title'] : []),
    ...(telling.pitch === '' ? ['a pitch paragraph'] : []),
  ];
  if (missing.length > 0) {
    issues.push({
      kind: 'incomplete-telling',
      target: null,
      message: `The Telling needs ${missing.join(' and ')}.`,
    });
  }
  for (const link of links) {
    if (!known.has(link)) {
      issues.push({
        kind: 'broken-link',
        target: link,
        message: `No Story or Proof \`${link}\`.`,
      });
    }
  }
  for (const story of stories) {
    if (!links.includes(story.id)) {
      issues.push({
        kind: 'unnamed-part',
        target: story.id,
        message: `The Telling never links its sub-Story \`${story.id}\`.`,
      });
    }
  }
  return issues;
}

/** Linked parts in the order the Telling first links them, then the rest by name. */
function inTellingOrder<
  A extends { readonly id: string; readonly name: string },
>(parts: readonly A[], links: readonly string[]): A[] {
  const rank = (part: A) => {
    const at = links.indexOf(part.id);
    return at === -1 ? Infinity : at;
  };
  return [...parts].sort((left, right) =>
    rank(left) === rank(right)
      ? left.name.localeCompare(right.name)
      : rank(left) - rank(right),
  );
}

function parentOf(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '' : path.slice(0, slash);
}

function ancestorsOf(path: string): string[] {
  const ancestors: string[] = [];
  for (let at = parentOf(path); at !== ''; at = parentOf(at)) {
    ancestors.push(at);
  }
  return ancestors;
}
