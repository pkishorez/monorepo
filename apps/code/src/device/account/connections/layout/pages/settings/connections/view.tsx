import type { Connection as ConnectionSchema } from '@kestack/connect/cloud';
import { View } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/ui/components/button';
import { RefreshCwIcon } from 'lucide-react';
import { Skeleton } from '@kestack/web-platform/ui/components/skeleton';
import { useEffect, useState } from 'react';
import * as Confirm from '../../../../../../../ui/controls/notice/index.ts';
import { Title } from '../../../../../../../ui/controls/settings/index.ts';
import { ago } from '../../../../../../../ui/labels/status/index.ts';
import { DOWN_AFTER, statusOf } from '../../../../connection/link/index.ts';
import { keyOf, ConnectionSettingsLive } from './actor.ts';
import { ConnectionCard } from './connection/index.ts';

/** The Auth Worker's Home Page, where a Sign-in is revoked. */
// Tests run with no env at all.
const authHome = `${(import.meta.env.VITE_AUTH_URL ?? '').replace(/\/+$/, '')}/`;

type Connection = typeof ConnectionSchema.Type;

/*
 * Settings → Connections: Reload, which turns once as it asks, as the
 * sidebar's does; then, once what this device kept has been read, one
 * card per Connection (`connection/`), drawn once. Forget, asked from a card,
 * asks first, saying when the Connection was last seen and how its tunnel
 * stands. Below, the way to the Auth Worker's Home Page, where a Connection's
 * Sign-in is revoked outright.
 */

const isDown = (connection: Connection, now: number) =>
  now - connection.lastSeen > DOWN_AFTER;

const lastSeen = (connection: Connection, now: number) =>
  isDown(connection, now)
    ? `Last seen ${ago(connection.lastSeen, now)}`
    : 'Online';

/** The real clock, every few seconds, for the Forget question's Last Seen. */
const useNow = () => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, []);
  return now;
};

/** Reload, as the sidebar's: a turn each time it asks. */
function Reload({ onReload }: { readonly onReload: () => void }) {
  const [turns, setTurns] = useState(0);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-11 gap-2 text-muted-foreground keyboard:h-8"
      title="Reload the Connections"
      onClick={() => {
        onReload();
        setTurns((n) => n + 1);
      }}
    >
      <RefreshCwIcon
        aria-hidden
        style={{ transform: `rotate(${turns * 360}deg)` }}
        className="size-4 transition-transform duration-700 ease-out motion-reduce:transition-none"
      />
      Reload
    </Button>
  );
}

export const ConnectionSettingsView = View.make(
  ConnectionSettingsLive,
  ({ root, model, children, send }) => {
    const now = useNow();
    const asked = model.connections?.find(({ id }) => id === model.asking);
    const forgetting =
      model.forgetting !== null && model.forgetting.id === model.asking
        ? model.forgetting
        : null;
    const shown = (model.connections ?? []).flatMap((connection) => {
      const key =
        model.accountId === null ? null : keyOf(model.accountId, connection.id);
      const card = children.cards.find((each) => each.key === key);
      // A Connection whose setup is still read waits, alone.
      return card === undefined ? [] : [card];
    });
    return (
      <section
        {...root}
        aria-labelledby="connections"
        className="flex flex-col gap-6"
      >
        <Title
          id="connections"
          name="Connections"
          action={<Reload onReload={() => send({ _tag: 'Reload' })} />}
        >
          The computers your sessions run on.
        </Title>
        {/* Nothing until what this device kept is read, so it draws once. */}
        {!model.drawn ? null : model.connections === null ? (
          <Skeleton aria-busy className="h-40 w-full rounded-xl" />
        ) : model.connections.length === 0 ? (
          <p className="text-sm text-muted-foreground">No Connections.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {shown.map((card) => (
              <ConnectionCard.view key={card.key} instance={card} />
            ))}
          </ul>
        )}
        {model.drawn && (
          <p className="text-xs text-muted-foreground">
            Revoke a Connection's sign-in from{' '}
            <a
              href={authHome}
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
            >
              your account
            </a>
            .
          </p>
        )}
        <Confirm.Dialog
          open={asked !== undefined}
          title={`Forget ${asked?.name ?? 'this Connection'}?`}
          description={
            asked === undefined
              ? ''
              : `${lastSeen(asked, now)} · ${statusOf(asked.status)}. It is signed out and stops; its sessions stay on it, but this device deletes what it kept of them.`
          }
          problem={forgetting?.problem ?? null}
          busy={forgetting !== null && forgetting.problem === null}
          keep="Keep it"
          confirm="Forget"
          onClose={() => send({ _tag: 'Keep' })}
          onConfirm={() => send({ _tag: 'Forget' })}
        />
      </section>
    );
  },
);
