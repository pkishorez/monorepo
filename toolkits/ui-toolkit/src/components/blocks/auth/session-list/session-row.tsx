import { Globe, Terminal } from 'lucide-react';

import { ActionButton, type Action } from '../action-button';
import { DetailList, DisclosureItem, OpenRow } from '../disclosure-list';
import { formatDate, formatDay } from './session-time';

export interface SessionView {
  id: string;
  userAgent: string | null;
  current: boolean;
  signedInAt: Date;
  lastActiveAt: Date;
  expiresAt: Date;
}

const isBrowser = (userAgent: string) => userAgent.startsWith('Mozilla/');

const capitalize = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

export function SessionRow({
  session,
  now,
  onEnd,
  alwaysOpen = false,
}: {
  alwaysOpen?: boolean;
  session: SessionView;
  now: Date;
  onEnd: Action;
}) {
  const name = session.userAgent?.trim() || 'Unknown device';
  const Row = alwaysOpen ? OpenRow : DisclosureItem;
  return (
    <Row
      value={`session:${session.id}`}
      icon={isBrowser(name) ? <Globe /> : <Terminal />}
      title={name}
      titleHint={name}
      aside={
        session.current ? (
          <span className="font-medium text-primary">This browser</span>
        ) : (
          capitalize(formatDay(session.lastActiveAt, now))
        )
      }
    >
      <DetailList
        details={[
          ['Signed in', formatDate(session.signedInAt)],
          ['Last active', capitalize(formatDay(session.lastActiveAt, now))],
          ['Expires', capitalize(formatDay(session.expiresAt, now))],
          [
            'Device',
            <span className="text-muted-foreground" key="device">
              {name}
            </span>,
          ],
        ]}
      />
      <ActionButton
        variant={session.current ? 'outline' : 'destructive'}
        size="sm"
        className="self-start"
        action={onEnd}
      >
        {session.current ? 'Sign out of this browser' : 'Revoke session'}
      </ActionButton>
    </Row>
  );
}
