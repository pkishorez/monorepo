import { Actor } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';

import { Project, ProjectView } from './children/actor-project/index.js';
import {
  ProjectPicker,
  ProjectPickerView,
} from './children/actor-project-picker/index.js';
import {
  MonoverseShape,
  init,
  isPicking,
  pickerKey,
  projectOf,
  projectProps,
  updates,
  workers,
} from './logic/index.js';
import { Body } from './view/index.js';

export const Monoverse = MonoverseShape.build({
  init,
  on: updates,
  workers,
  children: {
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
  },
  states: {
    Showing: {
      children: {
        project: Actor.child(Project, {
          key: ({ state }) => state.project,
          input: ({ state }) => ({ root: state.root }),
          props: projectProps,
          emits: {
            Moved: ({ package: path, branch, base, changes }) => ({
              _tag: 'Moved',
              package: path,
              branch,
              base,
              changes,
            }),
            DeletedToggled: () => ({ _tag: 'DeletedToggled' }),
            UnchangedChosen: ({ unchanged }) => ({
              _tag: 'UnchangedChosen',
              unchanged,
            }),
            IgnoredToggled: () => ({ _tag: 'IgnoredToggled' }),
            SwitchAsked: () => ({ _tag: 'SwitchAsked' }),
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
    project={
      self._tag === 'Showing' ? (
        <ProjectView instance={self.children.project} />
      ) : null
    }
  />
));
