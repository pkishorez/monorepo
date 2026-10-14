import { Route, Router } from '@kestack/kabuki/routing';
import { Pages, Routes } from '../../../shared/index.ts';
import {
  Loaded,
  PageFrame,
  Refreshing,
  Skeleton,
  link,
} from '../../components/index.ts';
import { MemberView } from './member.tsx';

/*
 * A team, and the member the URL names beside it. The team draws its
 * member's place whatever its own state: both load at once, and each shows
 * its own loading screen until its data comes. Opened at a member, the
 * member, quicker, shows first. Their Provenance boxes show both Loaders
 * started at the same moment.
 */

export const TeamView = Route.view(Pages.Teams, (self) => {
  const { status, params } = self.props;
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
      <Loaded status={status} label={`Loading the ${params.team} team…`}>
        {(team, refreshing) => (
          <PageFrame
            place="Teams"
            data={team}
            title={`${team.name} team`}
            intro="A dynamic page with a page under it. Pick a member: only the member loads, the team stays. Come back to a team seen before: its copy shows at once, and loads again behind it."
            aside={<Refreshing on={refreshing} />}
          >
            <ul className="flex flex-wrap gap-2">
              {team.members.map((member) => (
                <li key={member.handle}>
                  <Router.Link
                    to={Routes.Teams.Member({
                      team: team.slug,
                      member: member.handle,
                    })}
                    aria-current={
                      self.props.route.page?.member === member.handle
                        ? 'page'
                        : undefined
                    }
                    className="block rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted aria-[current=page]:bg-muted aria-[current=page]:font-medium"
                  >
                    {member.name}
                  </Router.Link>
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">
              Other team:{' '}
              <Router.Link
                to={Routes.Teams({
                  team: team.slug === 'core' ? 'web' : 'core',
                })}
                className={link}
              >
                {team.slug === 'core' ? 'Web' : 'Core'}
              </Router.Link>
            </p>
          </PageFrame>
        )}
      </Loaded>
      <div>
        {self.children.Member ? (
          <MemberView instance={self.children.Member} />
        ) : status._tag === 'Loading' ? (
          <Skeleton label="…" />
        ) : (
          <p className="text-sm text-muted-foreground">Pick a member.</p>
        )}
      </div>
    </div>
  );
});
