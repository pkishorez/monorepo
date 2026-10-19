import { Schema } from 'effect';
import { Page } from '@kestack/kabuki/routing';
import { CredentialSummary } from '../../contracts/credential/index.ts';

/**
 * Settings, at `/settings`: what a member sets up once and picks from
 * later, one section each. Drawn by the Worker with every section's data in
 * it, so the first paint is already filled in; each section then follows
 * its own data live.
 *
 * A section joins with its share of `data` here, filled in by the Settings
 * Loader, and a Child of the Settings build.
 */
export const Settings = Page.define({
  path: '/settings',
  metadata: { title: 'Settings · Alchemy Console' },
  data: Schema.Struct({
    /** The member's credentials when drawn; null for a visitor Console turns away. */
    credentials: Schema.NullOr(Schema.Array(CredentialSummary)),
  }),
});
