import type { Machine as MachineSchema } from '@kestack/connect/code';
import { View } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/ui/components/button';
import { Skeleton } from '@kestack/web-platform/ui/components/skeleton';
import { useEffect, useState } from 'react';
import * as Confirm from '../../../../ui/confirm/index.ts';
import { ago } from '../../../../ui/time/index.ts';
import {
  authHome,
  DOWN_AFTER,
  statusOf,
} from '../../../../layer/capabilities/index.ts';
import { MachineSettingsLive } from './actor.ts';
import { HarnessAccounts } from './harness-accounts/index.ts';
import { SpeechToText } from './speech-to-text/index.ts';

type Machine = typeof MachineSchema.Type;

/*
 * Settings → Machines: one card per Machine, drawn at once from the list:
 * its name, and a line with a dot for whether it is up, its Machine
 * Status and its version, and a quiet Forget, which asks first; then,
 * each between rules, its agents' accounts and its Speech to Text switch,
 * each loading on its own, so one that does not answer says so in its own
 * place. Below,
 * outside Local mode, the way to the Auth Worker's Home Page, where a
 * Machine's Sign-in is revoked outright.
 */

const isDown = (machine: Machine, now: number) =>
  now - machine.lastSeen > DOWN_AFTER;

const lastSeen = (machine: Machine, now: number) =>
  isDown(machine, now) ? `Last seen ${ago(machine.lastSeen, now)}` : 'Online';

/** The dot's colour: down, its tunnel working, or on its way or broken. */
const toneOf = (machine: Machine, now: number) =>
  isDown(machine, now)
    ? 'bg-destructive'
    : machine.status._tag === 'Reachable'
      ? 'bg-positive'
      : 'bg-warning';

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
  ({ root, model, children, send }) => {
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
              The computers your sessions run on.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-11 keyboard:h-8"
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
          <ul className="flex flex-col gap-4">
            {model.machines.map((machine) => {
              const settings = children.accounts.find(
                ({ key }) => key === machine.id,
              );
              const speech = children.speech.find(
                ({ key }) => key === machine.id,
              );
              return (
                <li
                  key={machine.id}
                  className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card *:p-4 sm:*:px-5"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="truncate text-sm font-semibold">
                        {machine.name}
                      </span>
                      <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                        <span
                          aria-hidden
                          className={`size-1.5 shrink-0 rounded-full ${toneOf(machine, now)}`}
                        />
                        <span
                          className="truncate"
                          title={statusOf(machine.status)}
                        >
                          {lastSeen(machine, now)} · {statusOf(machine.status)}
                        </span>
                        <span className="shrink-0 tabular-nums opacity-70">
                          v{machine.version}
                        </span>
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-11 text-muted-foreground hover:text-destructive keyboard:h-8"
                      aria-label={`Forget ${machine.name}`}
                      onClick={() =>
                        open(() => send({ _tag: 'Ask', id: machine.id }))
                      }
                    >
                      Forget
                    </Button>
                  </div>
                  {settings !== undefined && (
                    <HarnessAccounts.view instance={settings} />
                  )}
                  {speech !== undefined && (
                    <SpeechToText.view instance={speech} />
                  )}
                </li>
              );
            })}
          </ul>
        )}
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
        <Confirm.Dialog
          open={asked !== undefined}
          title={`Forget ${asked?.name ?? 'this Machine'}?`}
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
