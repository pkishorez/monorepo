import { Actor } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';

import { Tree, TreeView } from '../shared/actor-tree/index.js';
import {
  PackageShape,
  init,
  treeInput,
  treeProps,
  updates,
  workers,
} from './logic/index.js';
import { Body } from './view/index.js';

export const Package = PackageShape.build({
  init,
  on: updates,
  workers,
  states: {
    // 2. Show
    Contents: {
      children: {
        tree: Actor.child(Tree, {
          input: treeInput,
          props: treeProps,
          emits: {
            Opened: ({ path }) => ({ _tag: 'Opened', path }),
            Viewed: ({ path, files, sourceRoots }) => ({
              _tag: 'Viewed',
              path,
              files,
              sourceRoots,
            }),
          },
        }),
      },
    },
  },
});

export const PackageView = View.make(Package, (self) => (
  <Body
    {...self}
    tree={
      self._tag === 'Contents' ? (
        <TreeView instance={self.children.tree} />
      ) : null
    }
  />
));
