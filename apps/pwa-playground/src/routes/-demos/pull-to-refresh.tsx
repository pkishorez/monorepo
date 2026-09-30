import { type PullState, usePullToRefresh } from '@kstackz/use-gesture';
import { ArrowDownIcon, LoaderCircleIcon } from '@kstackz/ui-toolkit/lucide';
import { motion, useTransform } from '@kstackz/ui-toolkit/motion';
import { cn } from '@kstackz/ui-toolkit/utils';
import { type ReactNode, useState } from 'react';
import {
  Controls,
  Segmented,
  Stage,
  Toggle,
  Value,
  Values,
} from '../../components/index.ts';
import { oneOf } from '../../lib/search.ts';
import { Fingers, MAIL, pct, Phone, px } from './kit.tsx';

export type PullOptions = {
  readonly distance: number;
  readonly seconds: number;
  readonly enabled: boolean;
};

export const PULL_DEFAULTS: PullOptions = {
  distance: 72,
  seconds: 1.5,
  enabled: true,
};

const DISTANCES = [48, 72, 112] as const;
const SECONDS = [0.5, 1.5, 3] as const;

/** Options from a URL's search params; anything unknown falls back. */
export const parsePull = (s: Record<string, unknown>): PullOptions => ({
  distance: oneOf(s['distance'], DISTANCES, PULL_DEFAULTS.distance),
  seconds: oneOf(s['seconds'], SECONDS, PULL_DEFAULTS.seconds),
  enabled: oneOf(s['enabled'], [true, false], PULL_DEFAULTS.enabled),
});

export const pullCode = (
  o: PullOptions,
) => `import { usePullToRefresh } from '@kstackz/use-gesture';

const pull = usePullToRefresh({${o.distance === 72 ? '' : `\n  distance: ${o.distance}, // px to arm; 72 by default`}${o.enabled ? '' : '\n  enabled: false,'}
  onRefresh: () => refetch(), // the indicator holds until it settles
});

pull.state; // 'idle' | 'pulling' | 'armed' | 'refreshing'
<motion.div style={{ y: pull.y }}>{/* indicator */}</motion.div>
<motion.ul style={{ y: pull.y }} className="overflow-y-auto">…</motion.ul>`;

const LABEL: Record<PullState, string> = {
  idle: 'Pull to refresh',
  pulling: 'Pull to refresh',
  armed: 'Release to refresh',
  refreshing: 'Refreshing…',
};

type Message = (typeof MAIL)[number] & { readonly fresh: boolean };

function Screen(props: {
  readonly options: PullOptions;
  readonly controls: ReactNode;
}) {
  const { distance, seconds, enabled } = props.options;
  const [messages, setMessages] = useState<ReadonlyArray<Message>>(() =>
    MAIL.map((m) => ({ ...m, fresh: false })),
  );
  const pull = usePullToRefresh({
    distance,
    enabled,
    onRefresh: async () => {
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
      setMessages((current) => {
        const id = (current[0]?.id ?? 0) + 100;
        const base = MAIL[id % MAIL.length] ?? MAIL[0];
        const next = { ...base, id, fresh: true } as Message;
        return [next, ...current.map((m) => ({ ...m, fresh: false }))];
      });
    },
  });
  const indicatorY = useTransform(pull.y, (v) => v - 44);
  const rotate = useTransform(pull.progress, [0, 1], [0, 180]);
  const yText = useTransform(pull.y, px);
  const progressText = useTransform(pull.progress, pct);

  return (
    <>
      <Stage className="py-8">
        <Phone>
          <div className="flex h-12 shrink-0 items-center border-b border-border px-4 font-medium">
            Inbox
          </div>
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <motion.div
              aria-hidden="true"
              style={{ y: indicatorY }}
              className="absolute inset-x-0 top-0 z-10 flex justify-center"
            >
              <div
                className={cn(
                  'flex h-9 items-center gap-2 rounded-full bg-card px-3.5 text-sm shadow-md ring-1 ring-edge transition-colors duration-150',
                  pull.state === 'armed' && 'text-positive',
                )}
              >
                {pull.state === 'refreshing' ? (
                  <LoaderCircleIcon className="size-4 animate-spin motion-reduce:animate-none" />
                ) : (
                  <motion.span style={{ rotate }} className="flex">
                    <ArrowDownIcon className="size-4" />
                  </motion.span>
                )}
                {LABEL[pull.state]}
              </div>
            </motion.div>
            <motion.ul
              style={{ y: pull.y }}
              className="h-full overflow-y-auto bg-background"
            >
              {messages.map((m) => (
                // A new message grows in, so the rows under it glide down.
                <motion.li
                  key={m.id}
                  initial={m.fresh ? { height: 0, opacity: 0 } : false}
                  animate={{ height: 'auto', opacity: 1 }}
                  transition={{ type: 'spring', duration: 0.4, bounce: 0 }}
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
                    {m.fresh ? (
                      <span className="font-mono text-[11px] text-positive">
                        new
                      </span>
                    ) : null}
                  </div>
                </motion.li>
              ))}
            </motion.ul>
          </div>
        </Phone>
        <Fingers />
      </Stage>
      {props.controls}
      <Values>
        <Value label="state" testId="pull-state">
          {pull.state}
        </Value>
        <Value label="progress">
          <motion.span>{progressText}</motion.span>
        </Value>
        <Value label="y">
          <motion.span>{yText}</motion.span>
        </Value>
      </Values>
    </>
  );
}

/** usePullToRefresh on an inbox, with its options beside it. */
export function PullDemo(props: {
  readonly options: PullOptions;
  readonly onOptions: (options: PullOptions) => void;
}) {
  const { options } = props;
  const set = (patch: Partial<PullOptions>) =>
    props.onOptions({ ...options, ...patch });
  return (
    <Screen
      options={options}
      controls={
        <Controls>
          <Segmented
            label="Distance to arm"
            value={options.distance}
            options={DISTANCES.map((d) => ({ value: d, label: `${d}px` }))}
            onChange={(distance) => set({ distance })}
          />
          <Segmented
            label="Refresh takes"
            value={options.seconds}
            options={SECONDS.map((t) => ({ value: t, label: `${t}s` }))}
            onChange={(seconds) => set({ seconds })}
          />
          <Toggle
            label="Pulling refreshes"
            checked={options.enabled}
            onChange={(enabled) => set({ enabled })}
          />
        </Controls>
      }
    />
  );
}
