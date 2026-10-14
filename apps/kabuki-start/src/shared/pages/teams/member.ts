import { Schema } from 'effect';
import { Route } from '@kestack/kabuki/routing';
import { Profile } from '../../data/index.ts';

/** One member of a team: its Loader is quicker than its team's, and runs beside it. */
export const Member = Route.page({
  path: '/:member',
  params: { member: Schema.String },
  data: Profile,
  metadata: (_, profile) =>
    profile ? { title: `${profile.name} · Kabuki Start` } : {},
}).build({});
