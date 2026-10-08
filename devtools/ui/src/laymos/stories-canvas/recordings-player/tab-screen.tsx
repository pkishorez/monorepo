import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Monitor, Smartphone } from '@kstackz/web-platform/components/lucide';
import { cn } from '@kstackz/web-platform/components/utils';
import type { Recording, Step } from 'laymos/story/schema';

import { frameAt } from './recording-clock';
import type { ScreenSize } from './screen-size';

export function TabScreen({
  recording,
  size,
  time,
  step,
  frameUrl,
}: {
  readonly recording: Recording;
  readonly size: ScreenSize;
  readonly time: number;
  readonly step: Step | undefined;
  readonly frameUrl: (file: string) => string;
}) {
  const reducedMotion = useReducedMotion() ?? false;
  const index = frameAt(recording.frames, time);
  const frame = index === -1 ? undefined : recording.frames[index];
  const mobile = recording.deviceKind === 'mobile';
  const closed = time > recording.closedAt;
  const notOpen = time < recording.openedAt;
  const ours = step !== undefined && step.tab === recording.tab;
  const acting = ours && time <= step.endedAt;
  const DeviceIcon = mobile ? Smartphone : Monitor;

  const screen = (
    <div
      className={cn(
        'relative overflow-hidden bg-muted',
        mobile ? 'rounded-[22px]' : 'rounded-b-[7px]',
      )}
      style={{ width: size.width, height: size.height }}
    >
      {frame !== undefined && (
        <img
          src={frameUrl(frame.file)}
          alt={`${recording.tab} at ${Math.round(frame.at)} ms`}
          draggable={false}
          className={cn(
            'absolute inset-0 size-full object-contain transition-opacity duration-200',
            closed && 'opacity-40',
          )}
        />
      )}
      {notOpen && (
        <span className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
          Opens at {(recording.openedAt / 1000).toFixed(2)} s
        </span>
      )}
      {closed && (
        <span className="absolute inset-x-0 bottom-3 text-center text-xs font-medium text-foreground/80">
          Closed
        </span>
      )}
      <AnimatePresence initial={false}>
        {ours && !closed && (
          <motion.span
            key={`${step.startedAt}-${step.name}`}
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
            animate={{ opacity: acting ? 1 : 0.55, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
            className={cn(
              'pointer-events-none absolute left-1/2 flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-neutral-950/80 px-3 py-1.5 text-white shadow-lg ring-1 ring-white/10 backdrop-blur-sm',
              mobile ? 'bottom-6' : 'bottom-4',
              size.height > 420 ? 'text-[13px]' : 'text-[11.5px]',
            )}
          >
            <span className="font-mono text-[0.85em] text-white/60">
              {step.kind}
            </span>
            <span
              className={cn(
                'truncate font-medium',
                !step.passed && 'text-red-300',
              )}
            >
              {step.name}
            </span>
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );

  return (
    <figure className="flex shrink-0 flex-col items-center gap-2.5">
      {mobile ? (
        <div className="rounded-[30px] bg-neutral-900 p-[7px] shadow-sm dark:bg-neutral-800">
          {screen}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <div className="flex h-6 items-center gap-1.5 border-b border-border bg-muted/60 px-2.5">
            <span className="size-2 rounded-full bg-muted-foreground/25" />
            <span className="size-2 rounded-full bg-muted-foreground/25" />
            <span className="size-2 rounded-full bg-muted-foreground/25" />
          </div>
          {screen}
        </div>
      )}
      <figcaption
        className={cn(
          'flex h-5 items-center gap-1.5 text-xs transition-colors',
          acting ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        <DeviceIcon className="size-3.5" aria-hidden />
        <span className="font-medium">{recording.tab}</span>
        <span className="text-muted-foreground">· {recording.device}</span>
      </figcaption>
    </figure>
  );
}
