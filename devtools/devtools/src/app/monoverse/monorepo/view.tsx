import { View } from '@kestack/kabuki/react';

import { PackageView } from '../package/index.js';
import { TreeView } from '../tree/index.js';
import { MonorepoLive } from './actor.js';

/* A Monorepo is its tree, or the Package entered in its place. */

export const MonorepoView = View.make(MonorepoLive, ({ root, children }) => (
  <div {...root} className="h-full min-h-0">
    {children.package === undefined ? (
      <TreeView instance={children.tree} />
    ) : (
      <PackageView instance={children.package} />
    )}
  </div>
));
