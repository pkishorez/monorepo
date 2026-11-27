import { View } from '@kestack/kabuki/react';
import {
  TodoShape,
  editingCancelled,
  editingStarted,
  init,
  renamed,
  retried,
  saveFailed,
  saved,
  updates,
} from './logic/index.ts';
import { Body } from './view/index.ts';

export const Todo = TodoShape.build({
  init,
  on: updates,
  states: {
    Idle: { on: { EditingStarted: editingStarted } },
    Editing: {
      on: { Renamed: renamed, EditingCancelled: editingCancelled },
    },
    Saving: { on: { Saved: saved, SaveFailed: saveFailed } },
    Failed: { on: { Retried: retried, EditingCancelled: editingCancelled } },
  },
});

export const TodoView = View.make(Todo, (self) => <Body {...self} />);
