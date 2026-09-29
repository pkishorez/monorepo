import {
  GestureProvider,
  GestureZone,
  type PullState,
  usePullToRefresh,
} from '@kstackz/use-gesture';
import { ArrowDownIcon, LoaderCircleIcon } from '@kstackz/ui-toolkit/lucide';
import {
  motion,
  useMotionValue,
  useTransform,
} from '@kstackz/ui-toolkit/motion';
import { cn } from '@kstackz/ui-toolkit/utils';
import { type ReactNode, useState } from 'react';
import { Choice, Code, Toggle } from '../-gestures/index.ts';
import {
  type PatternGuide,
  PatternScreen,
  Stat,
  StatusBar,
  Touches,
} from './shell.tsx';

type Options = {
  readonly distance: number;
  readonly seconds: number;
  readonly enabled: boolean;
};

type Message = {
  readonly id: number;
  readonly from: string;
  readonly subject: string;
  /** Arrived with the latest refresh. */
  readonly fresh: boolean;
};

const PEOPLE = ['Ada', 'Grace', 'Linus', 'Margaret', 'Alan', 'Barbara'];
const SUBJECTS = [
  'Lunch on Friday?',
  'The build is green again',
  'Notes from the review',
  'Tickets for Saturday',
  'Your invoice',
  'Re: pull to refresh',
];

const message = (id: number, fresh: boolean): Message => ({
  id,
  from: PEOPLE[id % PEOPLE.length] ?? '',
  subject: SUBJECTS[id % SUBJECTS.length] ?? '',
  fresh,
});

const LABEL: Record<PullState, string> = {
  idle: 'Pull to refresh',
  pulling: 'Pull to refresh',
  armed: 'Release to refresh',
  refreshing: 'Refreshing…',
};

const INDICATOR = 40;

function PullApp(props: { readonly options: Options }) {
  const { distance, seconds, enabled } = props.options;
  const [messages, setMessages] = useState(() =>
    Array.from({ length: 20 }, (_, i) => message(20 - i, false)),
  );
  const pull = usePullToRefresh({
    distance,
    enabled,
    onRefresh: async () => {
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
      setMessages((current) => {
        const next = (current[0]?.id ?? 0) + 1;
        return [
          message(next, true),
          ...current.map((m) => ({ ...m, fresh: false })),
        ];
      });
    },
  });
  const scrollTop = useMotionValue(0);
  const scrollText = useTransform(scrollTop, (v) => `${Math.round(v)}px`);
  const yText = useTransform(pull.y, (v) => `${Math.round(v)}px`);
  const progressText = useTransform(
    pull.progress,
    (v) => `${Math.round(v * 100)}%`,
  );
  // The indicator hangs above the list and comes down with it.
  const indicatorY = useTransform(pull.y, (v) => v - INDICATOR - 8);
  const rotate = useTransform(pull.progress, [0, 1], [0, 180]);
  const armed = pull.state === 'armed';
  const refreshing = pull.state === 'refreshing';

  return (
    <>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <motion.div
          aria-hidden="true"
          style={{ y: indicatorY }}
          className="absolute inset-x-0 top-0 z-10 flex justify-center"
        >
          <div
            className={cn(
              'flex h-10 w-48 items-center justify-center gap-2 rounded-full bg-card text-sm shadow-md ring-1 ring-foreground/10 transition-colors duration-150',
              armed && 'text-positive',
            )}
          >
            {refreshing ? (
              <LoaderCircleIcon className="size-4 animate-spin" />
            ) : (
              <motion.span style={{ rotate }} className="flex">
                <ArrowDownIcon className="size-4" />
              </motion.span>
            )}
            <span className="w-[18ch]">{LABEL[pull.state]}</span>
          </div>
        </motion.div>
        <motion.ul
          style={{ y: pull.y }}
          onScroll={(event) => scrollTop.set(event.currentTarget.scrollTop)}
          className="h-full overflow-y-auto bg-background"
        >
          {messages.map((m) => (
            // A new message grows in, so the rows under it glide down.
            <motion.li
              key={m.id}
              initial={m.fresh ? { height: 0, opacity: 0 } : false}
              animate={{ height: 'auto', opacity: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 40 }}
              className={cn(
                'overflow-hidden border-b border-border transition-colors duration-700',
                m.fresh && 'bg-positive/10',
              )}
            >
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{m.from}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {m.subject}
                  </p>
                </div>
                <span
                  className={cn(
                    'w-10 shrink-0 text-right font-mono text-[11px] text-positive',
                    !m.fresh && 'invisible',
                  )}
                >
                  new
                </span>
              </div>
            </motion.li>
          ))}
        </motion.ul>
      </div>
      <StatusBar>
        <Stat name="state" width="10ch">
          {pull.state}
        </Stat>
        <Stat name="y" width="5ch">
          <motion.span>{yText}</motion.span>
        </Stat>
        <Stat name="progress" width="4ch">
          <motion.span>{progressText}</motion.span>
        </Stat>
        <Stat name="scrollTop" width="6ch">
          <motion.span>{scrollText}</motion.span>
        </Stat>
      </StatusBar>
      <Touches />
    </>
  );
}

const GUIDE: PatternGuide = {
  try: [
    'With the list at its top, pull down slowly a little, then let go.',
    'Pull down far, until the label reads Release to refresh, then let go.',
    'Pull until it is armed, push back up a bit, then let go.',
    'Pull again while it is still refreshing.',
    'Flick down a short way, fast.',
    'Scroll the list down, then drag down to scroll back up, and keep dragging past the top.',
    'Now lift, and pull down again from the top.',
    'Pull with two fingers.',
    'In Options, change the distance and the refresh time, and turn it off.',
  ],
  expect: [
    'The list and the indicator follow your finger, slower the further you pull; the arrow turns as progress fills. Short of the distance it springs back and nothing happens.',
    'Past the distance it is armed: the label and arrow turn green. Letting go refreshes: it holds at the distance with a spinner until the refresh ends, a new message arrives on top, and it springs back.',
    'Pushing back under the distance disarms it: state goes back to pulling and letting go does nothing.',
    'A pull during a refresh does nothing: it listens again once the refresh ends.',
    'A flick does not refresh: only how far you pulled counts, not momentum.',
    'That drag scrolls the list and stops at its top: the list owned the touch from its first movement, so no pull starts, even at the top. scrollTop shows it.',
    'From the top, the list cannot scroll further, so the zone takes the touch and the pull starts.',
    <>
      Two fingers do not pull: it is a one-finger Swipe, so it Cancels with{' '}
      <Code>fingers</Code>.
    </>,
    <>
      The indicator reaches the distance at twice that pull. The bar at the
      bottom shows <Code>state</Code>, <Code>y</Code>, <Code>progress</Code> and
      the list’s <Code>scrollTop</Code>.
    </>,
  ],
};

/** usePullToRefresh on an inbox, with its options at hand. */
export function PullToRefreshDemo(props: {
  readonly start: ReactNode;
  readonly end: ReactNode;
}) {
  const [options, setOptions] = useState<Options>({
    distance: 72,
    seconds: 1.5,
    enabled: true,
  });
  const set = (patch: Partial<Options>) =>
    setOptions((current) => ({ ...current, ...patch }));
  return (
    <PatternScreen
      title="usePullToRefresh"
      start={props.start}
      end={props.end}
      guide={GUIDE}
      options={
        <>
          <Choice
            label="distance"
            value={options.distance}
            options={[
              { value: 56, label: '56' },
              { value: 72, label: '72' },
              { value: 96, label: '96' },
            ]}
            onChange={(distance) => set({ distance })}
          />
          <Choice
            label="refresh"
            value={options.seconds}
            options={[
              { value: 0.5, label: '0.5s' },
              { value: 1.5, label: '1.5s' },
              { value: 3, label: '3s' },
            ]}
            onChange={(seconds) => set({ seconds })}
          />
          <Toggle
            label="enabled"
            on={options.enabled}
            onChange={(enabled) => set({ enabled })}
          />
        </>
      }
    >
      <GestureProvider>
        <GestureZone className="absolute inset-0 flex flex-col">
          <PullApp options={options} />
        </GestureZone>
      </GestureProvider>
    </PatternScreen>
  );
}
