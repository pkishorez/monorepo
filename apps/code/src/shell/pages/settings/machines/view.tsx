import type { Machine as MachineSchema } from '@kestack/connect/code';
import { View } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/ui/components/button';
import { RefreshCwIcon } from '@kestack/web-platform/ui/components/lucide';
import { Skeleton } from '@kestack/web-platform/ui/components/skeleton';
import { useEffect, useState } from 'react';
import * as Confirm from '../../../../ui/confirm/index.ts';
import { ago } from '../../../../ui/time/index.ts';
import {
  authHome,
  DOWN_AFTER,
  statusOf,
} from '../../../../layer/capabilities/index.ts';
import {
  StandingDot,
  standingOf,
  useHealths,
} from '../../../machines/index.ts';
import { keyOf, MachineSettingsLive } from './actor.ts';
import { HarnessAccounts } from './harness-accounts/index.ts';
import { SpeechToText } from './speech-to-text/index.ts';

type Machine = typeof MachineSchema.Type;

/*
 * Settings → Machines: Reload, which turns once as it asks, as the
 * sidebar's does; then one card per Machine, drawn at once from the list:
 * its name, and under it how it stands, its dot and its Line and Last Seen
 * as the sidebar says them, then its tunnel and the version of Connect it
 * runs, and a quiet Forget, which asks first; then, each between rules,
 * its agents' accounts and its Speech to Text switch, each shown as last
 * kept and asked of the Machine on its own, so one that does not answer
 * says so in its own place. Below, the way to the Auth Worker's Home
 * Page, where a Machine's Sign-in is revoked outright.
 */

const isDown = (machine: Machine, now: number) =>
  now - machine.lastSeen > DOWN_AFTER;

const lastSeen = (machine: Machine, now: number) =>
  isDown(machine, now) ? `Last seen ${ago(machine.lastSeen, now)}` : 'Online';

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
      title="Reload the Machines"
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

export const MachineSettingsView = View.make(
  MachineSettingsLive,
  ({ root, model, children, send }) => {
    const now = useNow();
    const healthOf = useHealths();
    const open = Confirm.useOpen();
    const asked = model.machines?.find(({ id }) => id === model.asking);
    const forgetting =
      model.forgetting !== null && model.forgetting.id === model.asking
        ? model.forgetting
        : null;
    return (
      <section
        {...root}
        aria-labelledby="machines"
        className="flex flex-col gap-4"
      >
        <header className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1">
            <h2 id="machines" className="text-sm font-semibold">
              Machines
            </h2>
            <p className="text-sm text-muted-foreground">
              The computers your sessions run on.
            </p>
          </div>
          <Reload onReload={() => send({ _tag: 'Reload' })} />
        </header>
        {/* Nothing until `Machines` first says, so a list it holds shows at once. */}
        {!model.heard ? null : model.machines === null ? (
          <Skeleton className="h-16 w-full" />
        ) : model.machines.length === 0 ? (
          <p className="text-sm text-muted-foreground">No Machines.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {model.machines.map((machine) => {
              const key =
                model.accountId === null
                  ? null
                  : keyOf(model.accountId, machine.id);
              const settings = children.accounts.find(
                (each) => each.key === key,
              );
              const speech = children.speech.find((each) => each.key === key);
              const standing = standingOf(healthOf(machine.id), machine);
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
                        <StandingDot kind={standing.kind} />
                        <span className="truncate">{standing.label}</span>
                      </span>
                      <span
                        className="truncate text-xs text-muted-foreground/80"
                        title={statusOf(machine.status)}
                      >
                        {statusOf(machine.status)} ·{' '}
                        <span className="tabular-nums">
                          Connect {machine.version}
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
