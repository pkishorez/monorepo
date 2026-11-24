import type { ReactNode } from 'react';
import type { ViewPropsOf } from '@kestack/kabuki/react/types';

import type { MonorepoShape } from '../logic/shared/index.js';

/* A Monorepo is its tree, or the Package entered in its place. */

type BodyProps = ViewPropsOf<typeof MonorepoShape> & {
  readonly tree: ReactNode;
  /** The Package entered, while one is. */
  readonly package: ReactNode;
};

export function Body({ root, tree, package: entered }: BodyProps) {
  return (
    <div {...root} className="h-full min-h-0">
      {entered === null ? tree : entered}
    </div>
  );
}
