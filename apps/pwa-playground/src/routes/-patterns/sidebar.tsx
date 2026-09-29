import { GestureProvider, GestureZone, useSidebar } from '@kstackz/use-gesture';
import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import {
  ArchiveIcon,
  FileIcon,
  InboxIcon,
  MenuIcon,
  SendIcon,
  StarIcon,
} from '@kstackz/ui-toolkit/lucide';
import {
  motion,
  useMotionValueEvent,
  useTransform,
} from '@kstackz/ui-toolkit/motion';
import { cn } from '@kstackz/ui-toolkit/utils';
import { type ReactNode, useState } from 'react';
import { Choice, Code, Toggle, tint, ZONE_COLORS } from '../-gestures/index.ts';
import {
  type PatternGuide,
  PatternScreen,
  Stat,
  StatusBar,
  Touches,
} from './shell.tsx';

type Options = {
  readonly side: 'left' | 'right';
  readonly width: number;
  /** The `edge` strip's width; 0 opens from anywhere. */
  readonly edge: number;
  readonly enabled: boolean;
  readonly band: boolean;
};

const NAV = [
  { name: 'Inbox', Icon: InboxIcon },
  { name: 'Starred', Icon: StarIcon },
  { name: 'Sent', Icon: SendIcon },
  { name: 'Drafts', Icon: FileIcon },
  { name: 'Archive', Icon: ArchiveIcon },
] as const;

const MAIL = Array.from({ length: 24 }, (_, i) => ({
  from: ['Ada', 'Grace', 'Linus', 'Margaret', 'Alan', 'Barbara'][i % 6],
  subject: [
    'Lunch on Friday?',
    'The build is green again',
    'Notes from the review',
    'Tickets for Saturday',
    'Your invoice',
    'Re: the sidebar spring',
  ][i % 6],
}));

const SKY = ZONE_COLORS[0];

const pct = (v: number) => `${Math.round(v * 100)}%`;

function SidebarApp(props: {
  readonly options: Options;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const { side, width, edge, enabled, band } = props.options;
  const sidebar = useSidebar({
    side,
    width,
    ...(edge === 0 ? {} : { edge }),
    enabled,
    open: props.open,
    onOpenChange: props.onOpenChange,
  });
  const progressText = useTransform(sidebar.progress, pct);
  const xText = useTransform(sidebar.x, (v) => `${Math.round(v)}px`);
  // Whether any of the scrim shows; flips rarely, unlike progress itself.
  const [showing, setShowing] = useState(false);
  useMotionValueEvent(sidebar.progress, 'change', (v) => setShowing(v > 0));
  const covering = props.open || sidebar.dragging || showing;

  return (
    <>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div className="flex h-full flex-col">
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-2">
            <Button
              size="icon"
              variant="ghost"
              aria-label="Open the sidebar"
              onClick={() => sidebar.setOpen(true)}
              className="size-10"
            >
              <MenuIcon aria-hidden="true" />
            </Button>
            <span className="font-medium">Inbox</span>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {MAIL.map((mail, i) => (
              <li key={i} className="border-b border-border px-4 py-3">
                <p className="text-sm font-medium">{mail.from}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {mail.subject}
                </p>
              </li>
            ))}
          </ul>
        </div>
        {edge === 0 || !band ? null : (
          // Where an opening Swipe must start; drawing only, it takes no touch.
          <div
            aria-hidden="true"
            style={{
              width: edge,
              borderColor: SKY,
              backgroundColor: tint(SKY, 20),
            }}
            className={cn(
              'pointer-events-none absolute inset-y-0 z-10 border-dashed',
              side === 'left' ? 'left-0 border-r-2' : 'right-0 border-l-2',
            )}
          />
        )}
        <motion.div
          aria-hidden="true"
          style={{ opacity: sidebar.progress }}
          onClick={() => sidebar.setOpen(false)}
          className={cn(
            'absolute inset-0 z-20 bg-black/50',
            !covering && 'pointer-events-none',
          )}
        />
        <motion.aside
          aria-label="Sidebar"
          style={{ x: sidebar.x, width }}
          className={cn(
            'absolute inset-y-0 z-30 flex flex-col bg-card shadow-xl',
            side === 'left' ? 'left-0' : 'right-0',
          )}
        >
          <p className="flex h-12 shrink-0 items-center px-4 font-semibold">
            Mail
          </p>
          <nav className="flex flex-col gap-0.5 px-2">
            {NAV.map(({ name, Icon }) => (
              <button
                key={name}
                type="button"
                onClick={() => sidebar.setOpen(false)}
                className="flex h-11 items-center gap-3 rounded-md px-3 text-left text-sm hover:bg-muted"
              >
                <Icon aria-hidden="true" className="size-4" />
                {name}
              </button>
            ))}
          </nav>
        </motion.aside>
      </div>
      <StatusBar>
        <Stat name="open" width="5ch">
          {String(sidebar.open)}
        </Stat>
        <Stat name="dragging" width="5ch">
          {String(sidebar.dragging)}
        </Stat>
        <Stat name="progress" width="4ch">
          <motion.span>{progressText}</motion.span>
        </Stat>
        <Stat name="x" width="6ch">
          <motion.span>{xText}</motion.span>
        </Stat>
      </StatusBar>
      <Touches />
    </>
  );
}

const GUIDE: PatternGuide = {
  try: [
    'Swipe right anywhere on the list, slowly, past half the sidebar’s width, then lift.',
    'Swipe right a little and lift slowly.',
    'Flick right a short way, fast.',
    'Scroll the list up and down, from the middle and from right by the edge.',
    'With it open, swipe back from anywhere: on the sidebar, on the dimmed list, or right next to it.',
    'Drag it most of the way open, then back a little, and lift while moving back.',
    'Tap the dimmed list, a sidebar item, or the menu button.',
    'Tap the menu button and grab the sidebar while it is still moving.',
    'In Options, set open from to 24 and swipe right from the middle, then from inside the dashed strip.',
    'With a strip set, scroll the list starting inside the strip.',
    'Switch the side and the width, and turn Swipes off.',
  ],
  expect: [
    'It follows your finger from the moment 10px locked the Swipe, and the list dims with it. Past half its width, it opens.',
    'Short of half, it springs back closed.',
    'A flick opens it from a few px: it settles where the momentum would carry it, not where your finger stopped.',
    'Scrolling never moves it: a vertical first movement locks the other axis, and the list keeps its own scroll.',
    'Closing works from anywhere, since there is nothing else to swipe while it is open.',
    'It decides by where it is headed, not where it is: moving back when you lift closes it even from mostly open.',
    <>
      Taps close or open it with the same spring. Taps are the browser’s, and
      only <Code>setOpen</Code> moves it.
    </>,
    'Grabbing it mid-spring stops the spring and it follows your finger from where it was.',
    <>
      With <Code>edge</Code> set, only a Swipe from the strip opens it, and the
      strip is always the sidebar’s: an edge swipe that starts a little downward
      still opens it rather than scrolling the list. Without a strip, the list
      and the sidebar share every touch by its first movement.
    </>,
    'A scroll that starts inside the strip does not scroll the list while it is closed: the strip is the sidebar’s. Open, the strip is the list’s again.',
    <>
      <Code>enabled: false</Code> leaves only the buttons. The bar at the bottom
      shows <Code>open</Code>, <Code>dragging</Code>, <Code>progress</Code> and{' '}
      <Code>x</Code> as they change.
    </>,
  ],
};

/** useSidebar on an inbox, with its options at hand. */
export function SidebarDemo(props: {
  readonly start: ReactNode;
  readonly end: ReactNode;
}) {
  const [options, setOptions] = useState<Options>({
    side: 'left',
    width: 280,
    edge: 0,
    enabled: true,
    band: true,
  });
  const [open, setOpen] = useState(false);
  const set = (patch: Partial<Options>) =>
    setOptions((current) => ({ ...current, ...patch }));
  return (
    <PatternScreen
      title="useSidebar"
      start={props.start}
      end={props.end}
      guide={GUIDE}
      options={
        <>
          <Choice
            label="side"
            value={options.side}
            options={[
              { value: 'left', label: 'left' },
              { value: 'right', label: 'right' },
            ]}
            onChange={(side) => {
              setOpen(false);
              set({ side });
            }}
          />
          <Choice
            label="width"
            value={options.width}
            options={[
              { value: 240, label: '240' },
              { value: 280, label: '280' },
              { value: 320, label: '320' },
            ]}
            onChange={(width) => set({ width })}
          />
          <Choice
            label="open from"
            value={options.edge}
            options={[
              { value: 0, label: 'anywhere' },
              { value: 16, label: '16' },
              { value: 24, label: '24' },
              { value: 48, label: '48' },
            ]}
            onChange={(edge) => set({ edge })}
          />
          <Toggle
            label="enabled"
            on={options.enabled}
            onChange={(enabled) => set({ enabled })}
          />
          <Toggle
            label="show edge"
            on={options.band}
            onChange={(band) => set({ band })}
          />
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
              setOpen(true)
            </Button>
            <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
              setOpen(false)
            </Button>
          </div>
        </>
      }
    >
      <GestureProvider>
        <GestureZone className="absolute inset-0 flex flex-col">
          <SidebarApp
            key={`${options.side}-${options.width}`}
            options={options}
            open={open}
            onOpenChange={setOpen}
          />
        </GestureZone>
      </GestureProvider>
    </PatternScreen>
  );
}
