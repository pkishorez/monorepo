import { View } from '@kestack/kabuki/react';
import { Pages } from '../../../shared/index.ts';
import { Loaded, PlaceFrame, pane } from '../../components/index.ts';

/*
 * One member, inside the team's page. Its Loader is quicker than the
 * team's, so it often shows first. Its activity is named for its member,
 * so a new member starts at the top.
 */

export const MemberView = View.make(Pages.MemberLive, ({ props }) => (
  <PlaceFrame
    place="Teams.Member"
    title={`@${props.params.member}`}
    status={props.status}
    fill
  >
    <div
      data-scroll-restoration-id={`member:${props.params.member}`}
      className={pane}
    >
      <Loaded
        status={props.status}
        label={`Loading @${props.params.member}… (0.7 s)`}
        lines={8}
      >
        {(member) => (
          <div className="space-y-3">
            <h2 className="font-semibold">{member.name}</h2>
            <p className="text-sm text-muted-foreground">
              {member.role}. {member.bio}
            </p>
            <ol className="list-disc space-y-1.5 pl-5 text-sm">
              {member.activity.map((done) => (
                <li key={done}>{done}</li>
              ))}
            </ol>
          </div>
        )}
      </Loaded>
    </div>
  </PlaceFrame>
));
