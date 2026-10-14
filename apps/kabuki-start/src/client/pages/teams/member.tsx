import { Route } from '@kestack/kabuki/routing';
import { Pages } from '../../../shared/index.ts';
import { Loaded, Provenance } from '../../components/index.ts';

/** One member: its own loading screen, inside the team's page, whatever the team's own state. */
export const MemberView = Route.view(Pages.Member, ({ props }) => (
  <section className="space-y-3 rounded-xl border border-border p-5">
    <Loaded status={props.status} label={`Loading @${props.params.member}…`}>
      {(member) => (
        <>
          <h2 className="text-xl font-semibold tracking-tight">
            {member.name}{' '}
            <span className="font-mono text-sm text-muted-foreground">
              @{member.handle}
            </span>
          </h2>
          <p className="text-muted-foreground">
            {member.role}. {member.bio}
          </p>
          <Provenance place="Teams.Member" data={member} />
        </>
      )}
    </Loaded>
  </section>
));
