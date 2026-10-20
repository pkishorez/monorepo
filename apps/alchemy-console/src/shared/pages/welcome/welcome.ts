import { Schema } from 'effect';
import { Page } from '@kestack/kabuki/routing';
import { GitHubConnection } from '../../contracts/github/index.ts';
import { Member } from '../../contracts/member/index.ts';
import { Api, Browser } from '../capabilities/index.ts';

/**
 * Where a member lands, at `/`: with no GitHub connection, one next step,
 * Connect GitHub; once they have one, their projects, none yet: "Create
 * your first project". Drawn by the Worker with the member and their
 * connections in it, then followed live in the browser, so a connection
 * made or removed in another tab shows here at once.
 *
 * `?github=` is how a return from installing the App went, set by
 * `/github/connected`; anything but `connected` is said above the page.
 */
export const Welcome = Page.define({
  path: '/',
  query: { github: Schema.optional(Schema.String) },
  data: Schema.Struct({
    // Both null for a visitor Console turns away.
    member: Schema.NullOr(Member),
    connections: Schema.NullOr(Schema.Array(GitHubConnection)),
  }),
  requires: [Api, Browser],
  model: Schema.Struct({
    /** The member as their User Space last said; null until it has. */
    member: Schema.NullOr(Member),
    /** Their connections as their User Space last said; null until it has. */
    connections: Schema.NullOr(Schema.Array(GitHubConnection)),
    /** On the way to GitHub. */
    connecting: Schema.Boolean,
    /** Why the last Connect GitHub failed, until the next. */
    problem: Schema.NullOr(Schema.String),
  }),
  message: Schema.TaggedUnion({
    MemberSeen: { member: Member },
    ConnectionsSeen: { connections: Schema.Array(GitHubConnection) },
    ConnectChosen: {},
    ConnectFailed: { message: Schema.String },
  }),
});
