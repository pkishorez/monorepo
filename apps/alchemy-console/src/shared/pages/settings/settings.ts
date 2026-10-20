import { Schema } from 'effect';
import { Page } from '@kestack/kabuki/routing';
import { CredentialSummary } from '../../contracts/credential/index.ts';
import { GitHubConnection } from '../../contracts/github/index.ts';

/**
 * Settings, at `/settings`: what a member sets up once and picks from
 * later, one section each. Drawn by the Worker with every section's data in
 * it, so the first paint is already filled in; each section then follows
 * its own data live.
 *
 * A section joins with its share of `data` here, filled in by the Settings
 * Loader, and a Child of the Settings build. `?github=` is how a return
 * from installing the App went, as on Welcome.
 */
export const Settings = Page.define({
  path: '/settings',
  query: { github: Schema.optional(Schema.String) },
  metadata: { title: 'Settings · Alchemy Console' },
  data: Schema.Struct({
    // Each null for a visitor Console turns away.
    /** The member's GitHub connections when drawn. */
    connections: Schema.NullOr(Schema.Array(GitHubConnection)),
    /** The member's credentials when drawn. */
    credentials: Schema.NullOr(Schema.Array(CredentialSummary)),
  }),
});
