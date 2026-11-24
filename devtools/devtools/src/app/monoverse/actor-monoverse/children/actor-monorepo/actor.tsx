import { Actor } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';

import { Package, PackageView } from '../shared/actor-package/index.js';
import { Tree, TreeView } from '../shared/actor-tree/index.js';
import {
  MonorepoShape,
  enteredKey,
  isEntered,
  packageInput,
  treeInput,
  treeProps,
  updates,
} from './logic/index.js';
import { Body } from './view/index.js';

export const Monorepo = MonorepoShape.build({
  on: updates,
  children: {
    // 1. Explore
    tree: Actor.child(Tree, {
      input: treeInput,
      props: treeProps,
      emits: {
        Entered: ({ path }) => ({ _tag: 'Entered', path }),
        Opened: ({ path }) => ({ _tag: 'Opened', path }),
        Viewed: ({ path, files, sourceRoots }) => ({
          _tag: 'Viewed',
          path,
          files,
          sourceRoots,
        }),
      },
    }),
    // 2. Enter
    package: Actor.child(Package, {
      while: isEntered,
      key: enteredKey,
      input: packageInput,
      props: ({ props }) => ({
        branch: props.branch,
        changes: props.changes,
        unchanged: props.unchanged,
        ignored: props.ignored,
      }),
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
});

export const MonorepoView = View.make(Monorepo, (self) => (
  <Body
    {...self}
    tree={<TreeView instance={self.children.tree} />}
    package={
      self.children.package === undefined ? null : (
        <PackageView instance={self.children.package} />
      )
    }
  />
));
