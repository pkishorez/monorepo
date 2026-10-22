import type { Machine as MachineSchema } from '@kestack/ai-toolkit/machines';

type Machine = typeof MachineSchema.Type;
import { View } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/components/button';
import { Skeleton } from '@kestack/web-platform/components/skeleton';
import { useEffect, useState } from 'react';
import * as Confirm from '../../../../ui/confirm/index.ts';
import { ago } from '../../../../ui/time/index.ts';
import { DOWN_AFTER, tunnelOf } from '../../../machines/index.ts';
import { authHome } from '../../../sign-in/index.ts';
import { MachineSettingsLive } from './actor.ts';

/*
 * Settings → Machines: one row per Machine, with when it was last seen and
 * how its tunnel stands, and Forget, which asks first. Below, outside
 * Local mode, the way to the Auth Worker's Home Page, where a Machine's
 * Sign-in is revoked outright.
 */

const lastSeen = (machine: Machine, now: number) =>
  now - machine.lastSeen > DOWN_AFTER
    ? `Last seen ${ago(machine.lastSeen, now)}`
    : 'Online';

/** The real clock, every few seconds, for each Last Seen. */
const useNow = () => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, []);
  return now;
};

export const MachineSettingsView = View.make(
  MachineSettingsLive,
  ({ root, model, send }) => {
    const now = useNow();
    const open = Confirm.useOpen();
    const asked = model.machines?.find(({ id }) => id === model.asking);
    const forgetting =
      model.forgetting !== null && model.forgetting.id === model.asking
        ? model.forgetting
        : null;
    return (
      <section {...root} className="flex flex-col gap-4">
        <header className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1">
            <h2 className="text-sm font-semibold">Machines</h2>
            <p className="text-sm text-muted-foreground">
              The computers your sessions run on. Forgetting one signs it out
              and deletes what this device keeps of it.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => send({ _tag: 'Refresh' })}
          >
            Refresh
          </Button>
        </header>
        {model.machines === null ? (
          <Skeleton className="h-16 w-full" />
        ) : model.machines.length === 0 ? (
          <p className="text-sm text-muted-foreground">No Machines.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
            {model.machines.map((machine) => (
              <li key={machine.id} className="flex items-center gap-3 p-4">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium">
                    {machine.name}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {lastSeen(machine, now)} · {tunnelOf(machine)} · ai-toolkit{' '}
                    {machine.version}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() =>
                    open(() => send({ _tag: 'Ask', id: machine.id }))
                  }
                >
                  Forget
                </Button>
              </li>
            ))}
          </ul>
        )}
        {authHome !== null && (
          <p className="text-xs text-muted-foreground">
            To revoke a Machine's sign-in outright, go to{' '}
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
          title={`Forget ${asked?.name ?? 'this Machine'}?`}
          description={
            asked === undefined
              ? ''
              : `${lastSeen(asked, now)} · ${tunnelOf(asked)}. It is signed out and stops; its sessions stay on it, but this device deletes what it kept of them.`
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
