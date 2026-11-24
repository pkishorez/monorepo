import type { ReactNode } from 'react';
import type { ViewPropsOf } from '@kestack/kabuki/react/types';

import type { ViewerShape } from '../logic/shared/index.js';
import { Folder } from './folder.js';

/*
 * What is open over the tree, in the dialog its holder draws: a file
 * alone, or a folder's list beside the file it shows.
 */

type BodyProps = ViewPropsOf<typeof ViewerShape> & {
  /** The FileViewer: the file open, or the one a folder shows. */
  readonly file: ReactNode;
};

export function Body(self: BodyProps) {
  if (self._tag === 'Folder') return <Folder {...self} />;
  return (
    <div {...self.root} className="h-full min-h-0">
      {self.file}
    </div>
  );
}
