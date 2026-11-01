/*
 * Every package the site documents, each with its one-sentence pitch. The
 * stack's home page leads to them, and the header switches between them.
 * Names are written in lowercase, always: `kabuki`, never `Kabuki`.
 */

export type Package = {
  readonly id: 'kabuki';
  readonly name: string;
  /** One word for what it is. */
  readonly kind: string;
  readonly pitch: string;
};

export const PACKAGES: ReadonlyArray<Package> = [
  {
    id: 'kabuki',
    name: 'kabuki',
    kind: 'framework',
    pitch: 'Logic, composed as a tree of Actors.',
  },
];

export const packageOf = (id: Package['id']): Package =>
  PACKAGES.find((entry) => entry.id === id)!;
