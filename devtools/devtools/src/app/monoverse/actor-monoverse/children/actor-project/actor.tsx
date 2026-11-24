import { Actor } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';

import { Package, PackageView } from './children/actor-package/index.js';
import { Viewer, ViewerView } from './children/actor-viewer/index.js';
import { Tree, TreeView } from './children/shared/actor-tree/index.js';
import {
  ProjectShape,
  enteredInput,
  enteredKey,
  init,
  isEntered,
  opensViewer,
  packageProps,
  singleInput,
  treeInput,
  treeProps,
  updates,
  viewerInput,
  viewerKey,
  workers,
} from './logic/index.js';
import { Body } from './view/index.js';

/*
 * The Tree is placed here, for the Monorepo, and by the Package for its
 * own files, so it sits in `children/shared/`.
 */

export const Project = ProjectShape.build({
  init,
  on: updates,
  workers,
  children: {
    // 4. View
    viewer: Actor.child(Viewer, {
      while: opensViewer,
      key: viewerKey,
      input: viewerInput,
      // Its list is drawn by the tree's settings, and changes them.
      props: ({ props }) => ({
        unchanged: props.unchanged,
        deleted: props.deleted,
        ignored: props.ignored,
      }),
      emits: {
        Closed: () => ({ _tag: 'ViewClosed' }),
        UnchangedChosen: ({ unchanged }) => ({
          _tag: 'UnchangedChosen',
          unchanged,
        }),
        DeletedToggled: () => ({ _tag: 'DeletedToggled' }),
        IgnoredToggled: () => ({ _tag: 'IgnoredToggled' }),
      },
    }),
  },
  states: {
    // 1. Analyse, 3. Enter
    Monorepo: {
      children: {
        tree: Actor.child(Tree, {
          input: treeInput,
          props: treeProps,
          emits: {
            Entered: ({ path }) => ({ _tag: 'Entered', package: path }),
            Opened: ({ path }) => ({ _tag: 'FileOpened', path }),
            Viewed: ({ path, files, sourceRoots }) => ({
              _tag: 'FolderViewed',
              path,
              files,
              sourceRoots,
            }),
          },
        }),
        package: Actor.child(Package, {
          while: isEntered,
          key: enteredKey,
          input: enteredInput,
          props: packageProps,
          emits: {
            Opened: ({ path }) => ({ _tag: 'FileOpened', path }),
            Viewed: ({ path, files, sourceRoots }) => ({
              _tag: 'FolderViewed',
              path,
              files,
              sourceRoots,
            }),
          },
        }),
      },
    },
    Package: {
      children: {
        package: Actor.child(Package, {
          input: singleInput,
          props: packageProps,
          emits: {
            Opened: ({ path }) => ({ _tag: 'FileOpened', path }),
            Viewed: ({ path, files, sourceRoots }) => ({
              _tag: 'FolderViewed',
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

export const ProjectView = View.make(Project, (self) => (
  <Body
    {...self}
    tree={
      self._tag === 'Monorepo' ? (
        <TreeView instance={self.children.tree} />
      ) : null
    }
    package={
      self._tag === 'Package' ? (
        <PackageView instance={self.children.package} />
      ) : self._tag === 'Monorepo' && self.children.package !== undefined ? (
        <PackageView instance={self.children.package} />
      ) : null
    }
    viewer={
      self.children.viewer === undefined ? null : (
        <ViewerView instance={self.children.viewer} />
      )
    }
  />
));
