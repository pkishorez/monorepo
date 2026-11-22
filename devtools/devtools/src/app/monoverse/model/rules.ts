import { isWithin, parentOf } from './paths.js';

/** One import, from the importing file to the file it imports. */
export type Link = readonly [from: string, to: string];

/*
 * Monoverse's one rule. A file may import a file in its own folder,
 * anything inside its child folders at any depth, its sibling folders and
 * folders beside any of its ancestors. It may never import a file that
 * sits directly in one of its ancestor folders: that file is the door of
 * something the importer is part of, and leaning on it ties the part back
 * to the whole.
 */

/** Whether importing `to` from `from` breaks the rule. */
export function isViolation(from: string, to: string): boolean {
  const own = parentOf(from);
  const target = parentOf(to);
  return target !== own && isWithin(own, target);
}

/** The imports that break the rule, in the order given. */
export function violationsOf(
  imports: ReadonlyArray<Link>,
): ReadonlyArray<Link> {
  return imports.filter(([from, to]) => isViolation(from, to));
}
