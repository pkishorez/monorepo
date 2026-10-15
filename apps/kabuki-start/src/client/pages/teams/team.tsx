import { motion } from 'motion/react';
import { Route, Router } from '@kestack/kabuki/routing';
import { Pages, Routes } from '../../../shared/index.ts';
import {
  Loaded,
  PlaceFrame,
  Slot,
  link,
  quick,
  panes,
  row,
} from '../../components/index.ts';
import { MemberView } from './member.tsx';

/*
 * A team, and the member the URL names beside it. The team draws its
 * member's place whatever its own state: both load at once, and each shows
 * its own loading screen until its data comes; the member, quicker, shows
 * first. Their headers show both Loaders took their own time, side by side.
 * The list stays as a member opens, and its links say `resetScroll` false.
 * It is named for its team, as the blog's list is, for the same reason.
 */

export const TeamView = Route.view(Pages.Teams, (self) => {
  const { status, params } = self.props;
  const member = self.children.Member;
  const open = self.props.route.page?.member;
  const other = params.team === 'core' ? 'web' : 'core';
  return (
    <PlaceFrame
      place="Teams"
      status={status}
      intro={
        <>
          The {params.team.charAt(0).toUpperCase() + params.team.slice(1)} team,
          drawn for each request: open at a member and both Loaders start
          together. Come back by a link and the list is where you left it. Try{' '}
          <Router.Link to={Routes.Teams({ team: other })} className={link}>
            the {other} team
          </Router.Link>
          .
        </>
      }
    >
      <div
        className={`grid gap-4 ${panes} lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]`}
      >
        <div
          data-scroll-restoration-id={`team:${params.team}`}
          className="max-h-80 overflow-y-auto overscroll-contain rounded-lg border border-border bg-background/60 p-1.5 lg:h-full lg:max-h-none"
        >
          <Loaded
            status={status}
            label={`Loading the ${params.team} team… (1.2 s)`}
            lines={8}
          >
            {(team) => (
              <ul>
                {team.members.map((each) => (
                  <li key={each.handle}>
                    <Router.Link
                      to={Routes.Teams.Member({
                        team: team.slug,
                        member: each.handle,
                      })}
                      resetScroll={false}
                      aria-current={open === each.handle ? 'page' : undefined}
                      className={`${row} justify-between aria-[current=page]:font-medium`}
                    >
                      {open === each.handle && (
                        <motion.span
                          layoutId="team-current"
                          transition={quick}
                          className="absolute inset-0 -z-10 rounded-lg bg-muted"
                        />
                      )}
                      <span className="truncate">{each.name}</span>
                      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                        {each.role}
                      </span>
                    </Router.Link>
                  </li>
                ))}
              </ul>
            )}
          </Loaded>
        </div>
        <Slot className="lg:h-full" id={member?.id ?? 'none'}>
          {member ? (
            <MemberView instance={member} />
          ) : (
            <div className="grid min-h-48 place-items-center rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground lg:h-full">
              Pick a member: only the member loads, the team stays.
            </div>
          )}
        </Slot>
      </div>
    </PlaceFrame>
  );
});
