import { Schema } from 'effect';
import { AiClient } from '@kestack/ai-toolkit/client';
import { Page, Router } from '@kestack/kabuki/routing';
import {
  ProjectRow,
  ProjectSessions,
  Refused,
  removeProject,
} from '../ai/index.ts';
import { home } from '../places/index.ts';
import { NewSessionLive } from './new-session/index.ts';
import { Session, SessionLive } from './session/index.ts';

/*
 * A project: its folder, its sessions, the form that starts one, and the
 * session open under it, if the URL names one. Removing it asks first,
 * then forgets the project; its folder is never touched.
 */

export const Project = Page.define({
  path: '/p/:projectId',
  params: { projectId: Schema.String },
  metadata: { title: 'Project · AI' },
  requires: [AiClient],
  pages: { Session },
  model: Schema.Struct({
    confirming: Schema.Boolean,
    removing: Schema.Boolean,
    problem: Schema.NullOr(Schema.String),
  }),
  message: Schema.TaggedUnion({
    Confirm: { open: Schema.Boolean },
    Remove: {},
    Removed: {},
    Refused,
  }),
});

export const ProjectLive = Page.build(Project, {
  init: () => ({
    model: { confirming: false, removing: false, problem: null },
  }),
  pages: { Session: SessionLive },
  children: {
    project: {
      actor: ProjectRow,
      props: ({ props }) => ({ projectId: props.params.projectId }),
    },
    sessions: {
      actor: ProjectSessions,
      props: ({ props }) => ({ projectId: props.params.projectId }),
    },
    newSession: {
      actor: NewSessionLive,
      props: ({ props }) => ({ projectId: props.params.projectId }),
    },
  },
  on: {
    Confirm: ({ open }, { model }) =>
      model.removing
        ? {}
        : { model: { ...model, confirming: open, problem: null } },
    Remove: (_, { model, props }) =>
      model.removing
        ? {}
        : {
            model: { ...model, removing: true },
            command: removeProject({ id: props.params.projectId }),
          },
    Removed: (_, { model }) => ({
      model: { ...model, confirming: false, removing: false },
      command: Router.push(home()),
    }),
    Refused: ({ reason }, { model }) => ({
      model: { ...model, removing: false, problem: reason },
    }),
  },
});
