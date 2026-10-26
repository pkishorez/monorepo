import type { Machine as MachineSchema } from '@kestack/connect/code';
import { View, type ViewProps } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/ui/components/button';
import {
  LockIcon,
  RefreshCwIcon,
  Trash2Icon,
} from '@kestack/web-platform/ui/components/lucide';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { Skeleton } from '@kestack/web-platform/ui/components/skeleton';
import { useDevice } from '@kestack/web-platform/ui/input';
import { useEffect, useState } from 'react';
import * as Confirm from '../../../../ui/confirm/index.ts';
import { Tab, TabList, TabTrack } from '../../../../ui/tabs/index.ts';
import { ago } from '../../../../ui/time/index.ts';
import {
  authHome,
  DOWN_AFTER,
  statusOf,
} from '../../../../layer/capabilities/index.ts';
import { StandingDot, standingOf, useLock } from '../../../machines/index.ts';
import { keyOf, MachineSettingsLive, MachineTab } from './actor.ts';
import { HarnessAccounts } from './harness-accounts/index.ts';
import { MachineProjects } from './projects/index.ts';
import { SpeechToText } from './speech-to-text/index.ts';

type Machine = typeof MachineSchema.Type;

/*
 * Settings → Machines: Reload, which turns once as it asks, as the
 * sidebar's does; then, once what this device kept has been read, one
 * card per Machine, drawn once: its name, whole, and one quiet line of how
 * it stands, its dot and its Line and Last Seen as the sidebar says them,
 * with a lock once its settings are said to be locked; on a wider screen
 * its tunnel and the version of Connect it runs under it; beside it Forget,
 * a bin in the danger colour, which asks first; and its tabs, as
 * Settings' own are drawn, of what it shows: Agents, each between rules
 * its agents' accounts and its Speech to Text switch, each as its Machine
 * Kit holds it, so one that does not answer says so in its own place; or
 * Projects, every Project on it (`projects/`). On a touch screen both sit
 * side by side, at least half the screen tall so there is room to swipe,
 * and a sideways swipe anywhere on the card moves them under the finger as
 * Settings' tabs move; one past either end is left to Settings' tabs.
 * Below, the way to the Auth Worker's Home Page, where a Machine's Sign-in
 * is revoked outright.
 */

type Children = ViewProps<typeof MachineSettingsLive>['children'];

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

/** A Machine's name, whole, and how it stands. */
function MachineHead({ machine }: { readonly machine: Machine }) {
  const { health, said } = useLock(machine.id);
  const standing = standingOf(health, machine);
  const details = `${statusOf(machine.status)} · Connect ${machine.version}`;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <h3 className="text-sm font-semibold [overflow-wrap:anywhere]">
        {machine.name}
      </h3>
      <p
        className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground"
        title={details}
      >
        <StandingDot kind={standing.kind} />
        <span className="truncate">{standing.label}</span>
        {said && (
          <LockIcon
            aria-label="Its settings can't be changed until it is back"
            className="size-3 shrink-0"
          />
        )}
      </p>
      <p className="hidden truncate text-xs text-muted-foreground/80 tabular-nums sm:block">
        {details}
      </p>
    </div>
  );
}

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

/**
 * One Machine's card: its head and Forget over its tabs, the tab open
 * under them; on a touch screen both tabs side by side, swiped between.
 */
function MachineCard({
  machine,
  tab,
  touch,
  accounts,
  speech,
  projects,
  onChoose,
  onForget,
}: {
  readonly machine: Machine;
  readonly tab: MachineTab;
  /** A touch screen: both tabs side by side, swiped between. */
  readonly touch: boolean;
  readonly accounts: Children['accounts'][number];
  readonly speech: Children['speech'][number];
  readonly projects: Children['projects'][number];
  readonly onChoose: (tab: MachineTab) => void;
  readonly onForget: () => void;
}) {
  const tabId = (each: MachineTab) =>
    `machine-${machine.id}-${each.toLowerCase()}-tab`;
  const panelId = (each: MachineTab) =>
    `machine-${machine.id}-${each.toLowerCase()}`;
  const heading = (
    <div className="flex flex-col gap-3 border-b border-border px-4 pt-4 sm:px-5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <MachineHead machine={machine} />
        </div>
        <Button
          type="button"
          variant="destructive"
          size="icon"
          className="-mt-1 -mr-2 size-11 keyboard:mt-0 keyboard:mr-0 keyboard:size-8"
          aria-label={`Forget ${machine.name}`}
          title={`Forget ${machine.name}…`}
          onClick={onForget}
        >
          <Trash2Icon aria-hidden />
        </Button>
      </div>
      <TabList label={`What ${machine.name} shows`} className="-mx-3">
        {MachineTab.literals.map((each) => (
          <Tab
            key={each}
            id={tabId(each)}
            controls={panelId(each)}
            selected={tab === each}
            onSelect={() => onChoose(each)}
            className="keyboard:h-9"
          >
            {each}
          </Tab>
        ))}
      </TabList>
    </div>
  );
  const panel = (each: MachineTab) => (
    <div
      role="tabpanel"
      id={panelId(each)}
      aria-labelledby={tabId(each)}
      className={cn(
        'flex flex-col divide-y divide-border *:px-4 *:py-4 sm:*:px-5',
        touch && 'min-h-[50dvh]',
      )}
    >
      {each === 'Agents' ? (
        <>
          <HarnessAccounts.view instance={accounts} />
          <SpeechToText.view instance={speech} />
        </>
      ) : (
        <MachineProjects.view instance={projects} />
      )}
    </div>
  );
  return (
    <li className="flex flex-col rounded-xl border border-border bg-card">
      {touch ? (
        <TabTrack
          open={tab}
          shown={MachineTab.literals}
          heading={heading}
          panel={panel}
          onChoose={onChoose}
        />
      ) : (
        <>
          {heading}
          {panel(tab)}
        </>
      )}
    </li>
  );
}

export const MachineSettingsView = View.make(
  MachineSettingsLive,
  ({ root, model, children, send }) => {
    const now = useNow();
    const { touch } = useDevice();
    const open = Confirm.useOpen();
    const asked = model.machines?.find(({ id }) => id === model.asking);
    const forgetting =
      model.forgetting !== null && model.forgetting.id === model.asking
        ? model.forgetting
        : null;
    const shown = (model.machines ?? []).flatMap((machine) => {
      const key =
        model.accountId === null ? null : keyOf(model.accountId, machine.id);
      const accounts = children.accounts.find((each) => each.key === key);
      const speech = children.speech.find((each) => each.key === key);
      const projects = children.projects.find((each) => each.key === key);
      // A Machine whose Kit is still read waits, alone.
      return accounts === undefined ||
        speech === undefined ||
        projects === undefined
        ? []
        : [{ machine, accounts, speech, projects }];
    });
    return (
      <section
        {...root}
        aria-labelledby="machines"
        className="flex flex-col gap-4"
      >
        <header className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 id="machines" className="text-sm font-semibold">
              Machines
            </h2>
            <p className="text-sm text-muted-foreground">
              The computers your sessions run on.
            </p>
          </div>
          <Reload onReload={() => send({ _tag: 'Reload' })} />
        </header>
        {/* Nothing until what this device kept is read, so it draws once. */}
        {!model.drawn ? null : model.machines === null ? (
          <Skeleton aria-busy className="h-40 w-full rounded-xl" />
        ) : model.machines.length === 0 ? (
          <p className="text-sm text-muted-foreground">No Machines.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {shown.map(({ machine, accounts, speech, projects }) => (
              <MachineCard
                key={machine.id}
                machine={machine}
                tab={model.tabs[machine.id] ?? 'Agents'}
                touch={touch}
                accounts={accounts}
                speech={speech}
                projects={projects}
                onChoose={(tab) =>
                  send({ _tag: 'TabChosen', id: machine.id, tab })
                }
                onForget={() =>
                  open(() => send({ _tag: 'Ask', id: machine.id }))
                }
              />
            ))}
          </ul>
        )}
        {model.drawn && (
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
