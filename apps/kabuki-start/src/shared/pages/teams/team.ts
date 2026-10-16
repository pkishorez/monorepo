import { Schema } from 'effect';
import { Page } from '@kestack/kabuki/routing';
import { Team as TeamData } from '../../data/index.ts';
import { Member, MemberLive } from './member.ts';

/*
 * A team, and the member the URL names under it: dynamic, drawn for each
 * request. Opened at a member, both Loaders start together; the team's
 * takes longer, so the member shows first.
 */

export const Team = Page.define({
  path: '/teams/:team',
  params: { team: Schema.String },
  render: 'dynamic',
  data: TeamData,
  metadata: (_, team) => (team ? { title: `${team.name} · Kabuki Start` } : {}),
  pages: { Member },
});

export const TeamLive = Page.build(Team, { pages: { Member: MemberLive } });
