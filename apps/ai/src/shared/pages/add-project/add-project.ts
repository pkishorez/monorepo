import { Schema } from 'effect';
import { AiClient } from '@kestack/ai-toolkit/client';
import { Actor } from '@kestack/kabuki';
import { Navigation, Router } from '@kestack/kabuki/routing';
import { addProject, Refused } from '../ai/index.ts';
import { project } from '../places/index.ts';

/*
 * Adding a folder as a project: the path typed so far, whether the form is
 * open (in the sidebar it sits in a popover), and the server's answer. A
 * path that is not absolute is refused here; one with no folder behind it,
 * by the server. Once added, the app moves to the project.
 */

export const AddProject = Actor.define('AddProject', {
  requires: [AiClient, Navigation],
  model: Schema.Struct({
    open: Schema.Boolean,
    path: Schema.String,
    adding: Schema.Boolean,
    problem: Schema.NullOr(Schema.String),
  }),
  message: Schema.TaggedUnion({
    Open: { open: Schema.Boolean },
    Typed: { path: Schema.String },
    Submit: {},
    Added: { id: Schema.String },
    Refused,
  }),
});

const fresh = { open: false, path: '', adding: false, problem: null };

/** Why `path` cannot be a project's folder, or null if it may be. */
export const pathProblem = (path: string) =>
  path.trim() === ''
    ? 'Type the path of a folder'
    : path.trim().startsWith('/')
      ? null
      : 'Use an absolute path, starting with /';

export const AddProjectLive = Actor.build(AddProject, {
  init: () => ({ model: fresh }),
  on: {
    Open: ({ open }, { model }) => ({
      model: { ...model, open, problem: open ? model.problem : null },
    }),
    Typed: ({ path }, { model }) => ({
      model: { ...model, path, problem: null },
    }),
    Submit: (_, { model }) => {
      if (model.adding) return {};
      const problem = pathProblem(model.path);
      if (problem !== null) return { model: { ...model, problem } };
      return {
        model: { ...model, adding: true, problem: null },
        command: addProject({
          path: model.path.trim().replace(/\/+$/, '') || '/',
        }),
      };
    },
    Added: ({ id }) => ({
      model: fresh,
      command: Router.push(project(id)),
    }),
    Refused: ({ reason }, { model }) => ({
      model: { ...model, adding: false, problem: reason },
    }),
  },
});
