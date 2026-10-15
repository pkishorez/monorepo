import { Route } from '@kestack/kabuki/routing';
import { Pages } from '../../../shared/index.ts';
import { Loaded, PlaceFrame, pane } from '../../components/index.ts';

/*
 * One member, inside the team's page, whatever the team's own state: its
 * Loader is quicker, so it often shows first. Its activity is named for its
 * member, so a new member starts at the top, and Back finds the one before
 * where it was.
 */

export const MemberView = Route.view(Pages.Member, ({ props }) => {
  return (
    <PlaceFrame place="Teams.Member" status={props.status} fill>
      <div
        data-scroll-restoration-id={`member:${props.params.member}`}
        className={`${pane} -mr-2 pr-2`}
      >
        <Loaded
          status={props.status}
          label={`Loading @${props.params.member}… (0.7 s)`}
          lines={8}
        >
          {(member) => (
            <div className="space-y-5">
              <header className="space-y-1.5">
                <h2 className="text-2xl font-semibold tracking-tight">
                  {member.name}{' '}
                  <span className="font-mono text-sm font-normal text-muted-foreground">
                    @{member.handle}
                  </span>
                </h2>
                <p className="text-sm text-muted-foreground">
                  {member.role}. {member.bio}
                </p>
              </header>
              <ol className="relative space-y-3 border-l border-border pl-4">
                {member.activity.map((done) => (
                  <li key={done} className="text-sm">
                    <span
                      aria-hidden
                      className="absolute -left-[3px] mt-1.5 size-1.5 rounded-full bg-border"
                    />
                    {done}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </Loaded>
      </div>
    </PlaceFrame>
  );
});
