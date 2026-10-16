import { Schema } from 'effect';
import { Page, Router } from '@kestack/kabuki/routing';
import { about, Notes as NotesData } from '../data/index.ts';

/*
 * A page with States of its own. Editing keeps a draft in its Model, copied
 * from its data when editing starts. A reload loads the data again behind
 * the data shown, and never touches the page: the draft survives.
 */

export const Notes = Page.define({
  path: '/notes',
  render: 'dynamic',
  data: NotesData,
  metadata: about(
    '/notes',
    'Notes',
    'A page with its own States, and a reload that keeps them.',
  ),
  model: Schema.Struct({ draft: Schema.String }),
  state: Schema.TaggedUnion({ Reading: {}, Editing: {} }),
  message: Schema.TaggedUnion({
    EditClicked: {},
    Typed: { text: Schema.String },
    CancelClicked: {},
    ReloadClicked: {},
  }),
});

export const NotesLive = Page.build(Notes, {
  init: () => ({ model: { draft: '' }, state: { _tag: 'Reading' } }),
  on: {
    ReloadClicked: () => ({ command: Router.reload() }),
  },
  state: {
    Reading: {
      on: {
        EditClicked: (_, { props }) =>
          props.status._tag === 'Ready'
            ? {
                model: { draft: props.status.data.text },
                state: { _tag: 'Editing' },
              }
            : {},
      },
    },
    Editing: {
      on: {
        Typed: ({ text }) => ({ model: { draft: text } }),
        CancelClicked: () => ({ state: { _tag: 'Reading' } }),
      },
    },
  },
});
