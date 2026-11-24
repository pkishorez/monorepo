import { Actor } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';

import {
  FileViewer,
  FileViewerView,
} from './children/shared/actor-file-viewer/index.js';
import {
  FolderViewer,
  FolderViewerView,
} from './children/actor-folder-viewer/index.js';
import { Monorepo, MonorepoView } from './children/actor-monorepo/index.js';
import { Package, PackageView } from './children/shared/actor-package/index.js';
import {
  ProjectPicker,
  ProjectPickerView,
} from './children/actor-project-picker/index.js';
import {
  MonoverseShape,
  fileInput,
  fileKey,
  folderInput,
  folderKey,
  init,
  isPicking,
  monorepoProps,
  opensFile,
  opensFolder,
  packageInput,
  packageProps,
  pickerKey,
  projectOf,
  updates,
  workers,
} from './logic/index.js';
import { Body } from './view/index.js';

/*
 * Five Children, more than three: the picker, the open file and the open
 * folder over the tree, and the tree itself as a Monorepo or a Single
 * Package, one State each. FileViewer and Package are placed by a Child
 * too, and the Tree by the Monorepo and the Package, so all three sit in
 * `children/shared/`, open to every parent that places them.
 */

export const Monoverse = MonoverseShape.build({
  init,
  on: updates,
  workers,
  children: {
    // 2. Pick
    picker: Actor.child(ProjectPicker, {
      while: isPicking,
      key: pickerKey,
      input: ({ state }) => ({ current: projectOf(state) }),
      props: ({ state }) => ({ current: projectOf(state) }),
      emits: {
        Picked: ({ project }) => ({ _tag: 'Picked', project }),
        Dismissed: () => ({ _tag: 'Dismissed' }),
      },
    }),
    // 7. View
    file: Actor.child(FileViewer, {
      while: opensFile,
      key: fileKey,
      input: fileInput,
      emits: { Closed: () => ({ _tag: 'FileClosed' }) },
    }),
    folder: Actor.child(FolderViewer, {
      while: opensFolder,
      key: folderKey,
      input: folderInput,
      // Its list is drawn by the tree's settings, and changes them.
      props: ({ model }) => ({
        unchanged: model.unchanged,
        deleted: model.deleted,
        ignored: model.ignored,
      }),
      emits: {
        Closed: () => ({ _tag: 'FolderClosed' }),
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
    // 4. Analyse, 6. Enter
    Monorepo: {
      children: {
        monorepo: Actor.child(Monorepo, {
          props: monorepoProps,
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
      },
    },
    Package: {
      children: {
        package: Actor.child(Package, {
          input: packageInput,
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

export const MonoverseView = View.make(Monoverse, (self) => (
  <Body
    {...self}
    picker={
      self.children.picker === undefined ? null : (
        <ProjectPickerView instance={self.children.picker} />
      )
    }
    file={
      self.children.file === undefined ? null : (
        <FileViewerView instance={self.children.file} />
      )
    }
    folder={
      self.children.folder === undefined ? null : (
        <FolderViewerView instance={self.children.folder} />
      )
    }
    monorepo={
      self._tag === 'Monorepo' ? (
        <MonorepoView instance={self.children.monorepo} />
      ) : null
    }
    package={
      self._tag === 'Package' ? (
        <PackageView instance={self.children.package} />
      ) : null
    }
  />
));
