import type { Action } from '../action-button';
import { DisclosureList } from '../disclosure-list';
import { SessionRow, type SessionView } from './session-row';
import { SignOutOthers } from './sign-out-others';

export type { SessionView } from './session-row';

const inDisplayOrder = (sessions: ReadonlyArray<SessionView>) =>
  [...sessions].sort(
    (a, b) =>
      Number(b.current) - Number(a.current) ||
      b.lastActiveAt.getTime() - a.lastActiveAt.getTime(),
  );

export function SessionList({
  sessions,
  now = new Date(),
  onSignOut,
  onRevoke,
  onRevokeOthers,
  open,
  onOpenChange,
}: {
  open: string | null;
  onOpenChange: (value: string | null) => void;
  sessions: ReadonlyArray<SessionView>;
  now?: Date | undefined;
  onSignOut: Action;
  onRevoke: (id: string) => Promise<unknown>;
  onRevokeOthers: Action;
}) {
  const others = sessions.filter((session) => !session.current).length;
  return (
    <section aria-labelledby="sessions-heading" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="sessions-heading" className="text-sm font-medium">
          Sessions
        </h2>
        {others > 0 ? (
          <SignOutOthers count={others} action={onRevokeOthers} />
        ) : null}
      </div>
      {sessions.length === 1 ? (
        <SessionRow
          alwaysOpen
          session={sessions[0]!}
          now={now}
          onEnd={
            sessions[0]!.current ? onSignOut : () => onRevoke(sessions[0]!.id)
          }
        />
      ) : (
        <DisclosureList open={open} onOpenChange={onOpenChange}>
          {inDisplayOrder(sessions).map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              now={now}
              onEnd={session.current ? onSignOut : () => onRevoke(session.id)}
            />
          ))}
        </DisclosureList>
      )}
    </section>
  );
}
