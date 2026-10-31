import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { Actions } from './actions/index.ts';
import { Projects } from './projects/index.ts';
import { Sessions } from './sessions/index.ts';

/*
 * The Pickers: what the keys open anywhere, over every page, each told only
 * what it needs of Layout.
 *
 * 1. Projects  the Project Picker, with its folder Steps: a project to
 *              work in, on the Account drawn.
 * 2. Sessions  the Session Switcher: a session to go back to.
 * 3. Actions   what can be done where the user is, each with its keys as
 *              the Bindings say: the open session's actions, and every
 *              Action of the keyboard that works there.
 */

const Pickers = Actor.define('Pickers', {
  props: Schema.Struct({
    /** The Account drawn. */
    accountId: Schema.String,
    /** The user's own keys, by Action id. */
    bindings: Schema.Record(Schema.String, Schema.Array(Schema.String)),
  }),
});

export const PickersLive = Pickers.build({
  children: {
    // 1. Projects
    projects: Actor.child(Projects.actor, {
      props: ({ props }) => ({ accountId: props.accountId }),
    }),
    // 2. Sessions
    sessions: Actor.child(Sessions.actor),
    // 3. Actions
    actions: Actor.child(Actions.actor, {
      props: ({ props }) => ({ bindings: props.bindings }),
    }),
  },
});
