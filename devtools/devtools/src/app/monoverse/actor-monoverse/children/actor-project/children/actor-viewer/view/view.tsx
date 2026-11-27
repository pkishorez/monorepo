import type { ReactNode } from 'react';
import type { ViewPropsOf } from '@kestack/kabuki/react/types';

import type { ViewerShape } from '../logic/shared/index.js';
import { Folder } from './folder.js';

type BodyProps = ViewPropsOf<typeof ViewerShape> & {
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
