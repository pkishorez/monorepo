/*
 * The story the home page tells between its opening and its ending, one
 * chapter per package with docs to read. Today that is kabuki alone; the
 * rest of the stack joins when it has docs. Each chapter names the shape
 * the particle field takes while it is read, and which half of a wide
 * screen that shape takes, so the words go in the other: the opening's
 * shape is on the right and the ending's too, so a chapter's is on the
 * left, and the shapes cross the screen as they change. Package names are
 * lowercase, always.
 */

export type Chapter = {
  readonly shape: string;
  /** Where the shape sits on a wide screen; the words take the other half. */
  readonly side: 'left' | 'right';
  /** A word or two over the name, in mono. */
  readonly act: string;
  readonly name: string;
  readonly pitch: string;
};

export const CHAPTERS: ReadonlyArray<Chapter> = [
  {
    shape: 'kabuki',
    side: 'left',
    act: 'the framework',
    name: 'kabuki',
    pitch: 'An app is one tree of Actors, outside React.',
  },
];
