import type { TreeIndex } from '../story-scope';

export type TellingLink =
  | { readonly kind: 'external'; readonly href: string }
  | { readonly kind: 'story'; readonly id: string }
  | { readonly kind: 'proof'; readonly id: string }
  | { readonly kind: 'broken'; readonly id: string };

const external = /^(?:[a-z][a-z\d+.-]*:|\/\/|#|\/)/i;

/**
 * What a link in a Telling points at. A target that is not a URL is a Story
 * id or Proof id of the same Project; one that names neither is broken.
 */
export function resolveLink(href: string, index: TreeIndex): TellingLink {
  if (external.test(href)) return { kind: 'external', href };
  const id = href.replace(/\/+$/, '');
  if (index.stories.has(id)) return { kind: 'story', id };
  if (index.proofs.has(id)) return { kind: 'proof', id };
  return { kind: 'broken', id };
}
