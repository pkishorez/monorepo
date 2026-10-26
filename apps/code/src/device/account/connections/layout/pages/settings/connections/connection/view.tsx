import type { Connection as ConnectionSchema } from '@kestack/connect/code';
import { View } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/ui/components/button';
import { LockIcon, Trash2Icon } from 'lucide-react';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { useDevice } from '@kestack/web-platform/ui/input';
import * as Confirm from '../../../../../../../../ui/controls/notice/index.ts';
import {
  Tab,
  TabList,
  TabTrack,
} from '../../../../../../../../ui/controls/settings/index.ts';
import { statusOf } from '../../../../../connection/link/index.ts';
import {
  ConnectionNotice,
  StandingDot,
  standingOf,
  useLock,
  useNoticeClock,
} from '../../../../../connection/link/index.ts';
import { ConnectionCardLive, ConnectionTab } from './actor.ts';
import { HarnessAccounts } from './accounts/index.ts';
import { ConnectionProjects } from './projects/index.ts';
import { SpeechToText } from './speech/index.ts';

type Connection = typeof ConnectionSchema.Type;

/*
 * One Connection's card: its name, whole, and one quiet line of how it
 * stands, its dot and its Link and Last Seen as the sidebar says them,
 * with a lock once its settings are said to be locked; on a wider screen
 * its tunnel and the version of Connect it runs under it; beside it
 * Forget, a quiet bin that turns the danger colour under the pointer,
 * which the list asks first; while its code Plugin is Updating or stopped,
 * or its `ke-connect` is out of date, what to know and do about it; and its tabs, as Settings' own are drawn, of
 * what it shows: Agents, each between rules its agents' accounts and its
 * Speech to Text switch, each as its Connection's setup holds it, so one that
 * does not answer says so in its own place; or Projects, every Project on
 * it (`projects/`). On a touch screen both sit side by side, at least half
 * the screen tall so there is room to swipe, and a sideways swipe anywhere
 * on the card moves them under the finger as Settings' tabs move; one past
 * either end is left to Settings' tabs.
 */

/** A Connection's name, whole, and how it stands. */
function ConnectionHead({ connection }: { readonly connection: Connection }) {
  const { health, said } = useLock(connection.id);
  const standing = standingOf(health, connection);
  const details = `${statusOf(connection.status)} · Connect ${connection.version}`;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <h3 className="text-sm font-semibold [overflow-wrap:anywhere]">
        {connection.name}
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

export const ConnectionCardView = View.make(
  ConnectionCardLive,
  ({ root, model, props, children, send }) => {
    const { touch } = useDevice();
    const open = Confirm.useOpen();
    const { connection } = props;
    const now = useNoticeClock(connection);
    const onChoose = (tab: ConnectionTab) => send({ _tag: 'TabChosen', tab });
    const tabId = (each: ConnectionTab) =>
      `connection-${connection.id}-${each.toLowerCase()}-tab`;
    const panelId = (each: ConnectionTab) =>
      `connection-${connection.id}-${each.toLowerCase()}`;
    const heading = (
      <div className="flex flex-col gap-3 border-b border-border/60 px-4 pt-4 sm:px-5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <ConnectionHead connection={connection} />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="-mt-1 -mr-2 size-11 text-muted-foreground hover:bg-destructive/10 hover:text-destructive keyboard:mt-0 keyboard:mr-0 keyboard:size-8"
            aria-label={`Forget ${connection.name}`}
            title={`Forget ${connection.name}…`}
            onClick={() => open(() => send({ _tag: 'ForgetAsked' }))}
          >
            <Trash2Icon aria-hidden />
          </Button>
        </div>
        <ConnectionNotice connection={connection} now={now} />
        <TabList label={`What ${connection.name} shows`} className="-mx-3">
          {ConnectionTab.literals.map((each) => (
            <Tab
              key={each}
              id={tabId(each)}
              controls={panelId(each)}
              selected={model.tab === each}
              onSelect={() => onChoose(each)}
              className="keyboard:h-9"
            >
              {each}
            </Tab>
          ))}
        </TabList>
      </div>
    );
    const panel = (each: ConnectionTab) => (
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
            <HarnessAccounts.view instance={children.accounts} />
            <SpeechToText.view instance={children.speech} />
          </>
        ) : (
          <ConnectionProjects.view instance={children.projects} />
        )}
      </div>
    );
    return (
      <li
        {...root}
        className="flex flex-col rounded-xl border border-border/60"
      >
        {touch ? (
          <TabTrack
            open={model.tab}
            shown={ConnectionTab.literals}
            heading={heading}
            panel={panel}
            onChoose={onChoose}
          />
        ) : (
          <>
            {heading}
            {panel(model.tab)}
          </>
        )}
      </li>
    );
  },
);
