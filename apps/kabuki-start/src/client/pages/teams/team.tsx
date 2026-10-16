import { View } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import { Pages, router } from '../../../shared/index.ts';
import {
  Loaded,
  PlaceFrame,
  link,
  list,
  panes,
  row,
} from '../../components/index.ts';
import { MemberView } from './member.tsx';

/*
 * A team, and the member the URL names beside it. The team draws its
 * member's place whatever its own state, so both load at once and the
 * member, quicker, shows first. The list is named for its team, as the
 * blog's is, and its links say `resetScroll` false.
 */

export const TeamView = View.make(Pages.TeamsLive, (self) => {
  const { status, params } = self.props;
  const member = self.children.Member;
  const open = self.props.route.page?.member;
  const other = params.team === 'core' ? 'web' : 'core';
  return (
    <PlaceFrame
      place="Teams"
      title={`The ${params.team} team`}
      status={status}
      intro={
        <>
          Open at a member, both Loaders start together.{' '}
          <Router.Link to={router.Teams({ team: other })} className={link}>
            The {other} team
          </Router.Link>
          .
        </>
      }
    >
      <div
        className={`grid gap-3 ${panes} lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]`}
      >
        <div
          data-scroll-restoration-id={`team:${params.team}`}
          className={list}
        >
          <Loaded
            status={status}
            label={`Loading the ${params.team} team… (1.2 s)`}
          >
            {(team) => (
              <ul>
                {team.members.map((each) => (
                  <li key={each.handle}>
                    <Router.Link
                      to={router.Teams.Member({
                        team: team.slug,
                        member: each.handle,
                      })}
                      resetScroll={false}
                      aria-current={open === each.handle ? 'page' : undefined}
                      className={`${row} justify-between`}
                    >
                      <span className="truncate">{each.name}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {each.role}
                      </span>
                    </Router.Link>
                  </li>
                ))}
              </ul>
            )}
          </Loaded>
        </div>
        {member ? (
          <MemberView instance={member} />
        ) : (
          <p className="grid min-h-40 place-items-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
            Pick a member.
          </p>
        )}
      </div>
    </PlaceFrame>
  );
});
