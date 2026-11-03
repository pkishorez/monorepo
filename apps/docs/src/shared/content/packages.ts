import type { Contents } from './contents.ts';
import { KABUKI_CONTENTS } from './kabuki.ts';
import { STD_TOOLKIT_CONTENTS } from './std-toolkit.ts';

/*
 * Every package the site documents, each with its one-sentence pitch and
 * its table of contents. The stack's home page leads to them, and the
 * header switches between them. Names are written in lowercase, always:
 * `kabuki`, never `Kabuki`.
 */

export type Package = {
  readonly id: 'kabuki' | 'std-toolkit';
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
    name: 'kabuki',
    kind: 'framework',
    pitch: 'Logic, composed as a tree of Actors.',
    code: 'packages/kabuki',
    contents: KABUKI_CONTENTS,
  },
  {
    id: 'std-toolkit',
    name: 'std-toolkit',
    kind: 'data',
    pitch: 'Describe your data once, change its shape freely, keep it in sync.',
    code: 'toolkits/std-toolkit',
    contents: STD_TOOLKIT_CONTENTS,
  },
];

export const packageOf = (id: Package['id']): Package =>
  PACKAGES.find((entry) => entry.id === id)!;
