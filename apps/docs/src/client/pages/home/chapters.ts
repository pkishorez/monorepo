import type { Package } from '../../../shared/index.ts';
import type { ShapeName } from '../../field/index.ts';

/*
 * The story the home page tells between its opening and its ending, one
 * chapter per package with docs to read: kabuki, then std-toolkit; the
 * rest of the stack joins when it has docs. Each chapter names the shape
 * the particle field takes while it is read, and which half of a wide
 * screen that shape takes, so the words go in the other. The sides
 * alternate down the page, the opening's on the right, so the shapes cross
 * the screen as they change. A chapter's name and pitch are its package's.
 */

export type Chapter = {
  readonly id: Package['id'];
  readonly shape: ShapeName;
  /** Where the shape sits on a wide screen; the words take the other half. */
  readonly side: 'left' | 'right';
  /** A word or two over the name, in mono. */
  readonly act: string;
};

export const CHAPTERS: ReadonlyArray<Chapter> = [
  { id: 'kabuki', shape: 'kabuki', side: 'left', act: 'the framework' },
  { id: 'std-toolkit', shape: 'std', side: 'right', act: 'the data' },
];
