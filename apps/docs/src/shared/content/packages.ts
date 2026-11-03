import type { Contents } from './contents.ts';
import { KABUKI_CONTENTS } from './kabuki.ts';
import { STD_TOOLKIT_CONTENTS } from './std-toolkit.ts';

/*
 * Every package the site documents, each with its one-sentence pitch and
 * its table of contents, on the shelf it sits on: libraries, and later
 * apps. The stack's home page leads to them, and the sidebar's switcher
 * moves between them, shelf by shelf. Names are written in lowercase,
 * always: `kabuki`, never `Kabuki`.
 */

/** Where a package sits in ke stack: a library to build with, or an app. */
export type Shelf = 'library' | 'app';

/** The shelves, in the order the switcher shows them, with their titles. */
export const SHELVES: ReadonlyArray<{
  readonly id: Shelf;
  readonly title: string;
}> = [
  { id: 'library', title: 'Libraries' },
  { id: 'app', title: 'Apps' },
];

export type Package = {
  readonly id: 'kabuki' | 'std-toolkit';
  readonly shelf: Shelf;
  readonly name: string;
  /** One word for what it is. */
  readonly kind: string;
  readonly pitch: string;
  /** Where its code is, under the monorepo. */
  readonly code: string;
  readonly contents: Contents;
};

export const PACKAGES: ReadonlyArray<Package> = [
  {
    id: 'kabuki',
    shelf: 'library',
    name: 'kabuki',
    kind: 'framework',
    pitch: 'Logic, composed as a tree of Actors.',
    code: 'packages/kabuki',
    contents: KABUKI_CONTENTS,
  },
  {
    id: 'std-toolkit',
    shelf: 'library',
    name: 'std-toolkit',
    kind: 'data',
    pitch: 'Describe your data once, change its shape freely, keep it in sync.',
    code: 'toolkits/std-toolkit',
    contents: STD_TOOLKIT_CONTENTS,
  },
];

export const packageOf = (id: Package['id']): Package =>
  PACKAGES.find((entry) => entry.id === id)!;

/** Each shelf with a package on it, and its packages, in order. */
export const shelved = (): ReadonlyArray<{
  readonly id: Shelf;
  readonly title: string;
  readonly packages: ReadonlyArray<Package>;
}> =>
  SHELVES.map((shelf) => ({
    ...shelf,
    packages: PACKAGES.filter((entry) => entry.shelf === shelf.id),
  })).filter((shelf) => shelf.packages.length > 0);
