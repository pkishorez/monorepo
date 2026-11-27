import type { ReactNode } from 'react';
import { CircleAlertIcon } from 'lucide-react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import type { ViewPropsOf } from '@kestack/kabuki/react/types';
import { Button } from '@kestack/web-platform/ui/components/button';
import { Kbd } from '@kestack/web-platform/ui/components/kbd';
import { Skeleton } from '@kestack/web-platform/ui/components/skeleton';
import { allDone, leftOf } from '../logic/shared/index.ts';
import type { TodosShape } from '../logic/shared/index.ts';
import { Composer } from './composer.tsx';

type BodyProps = ViewPropsOf<typeof TodosShape> & {
  readonly todos: ReadonlyArray<{
    readonly key: string;
    readonly view: ReactNode;
  }>;
};

const ENTER = { duration: 0.18, ease: [0.23, 1, 0.32, 1] } as const;

function Loading() {
  return (
    <ul aria-label="Loading to-dos" className="divide-y divide-border">
      {[64, 48, 72].map((width) => (
        <li key={width} className="flex items-center gap-3 px-4 py-3.5">
          <Skeleton className="size-4 rounded-[4px]" />
          <Skeleton className="h-3.5" style={{ width: `${width}%` }} />
        </li>
      ))}
    </ul>
  );
}

function Message({
  children,
  action,
}: {
  readonly children: ReactNode;
  readonly action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      {children}
      {action}
    </div>
  );
}

export function Body(self: BodyProps) {
  const { model, state, send, todos } = self;
  const left = leftOf(self);
  return (
    <MotionConfig reducedMotion="user">
      <section className="mx-auto flex w-full max-w-xl flex-col gap-6 px-5 py-12 sm:py-20">
        <header className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">To-dos</h1>
          <p className="text-sm text-pretty text-muted-foreground">
            Every click is a Message. Press <Kbd>Ctrl</Kbd> <Kbd>/</Kbd> or{' '}
            <Kbd>⌘</Kbd> <Kbd>/</Kbd> to watch them arrive in the Inspector.
          </p>
        </header>

        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.04),0_6px_16px_-4px_rgb(0_0_0/0.06)] dark:shadow-none">
          <Composer
            ready={state._tag === 'Ready'}
            onAdd={(title) => send({ _tag: 'Added', title })}
          />
          <div className="border-t border-border">
            {state._tag === 'Loading' && <Loading />}
            {state._tag === 'Failed' && (
              <Message
                action={
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => send({ _tag: 'Retried' })}
                  >
                    Try again
                  </Button>
                }
              >
                <p
                  role="alert"
                  className="flex items-center gap-1.5 text-sm text-destructive"
                >
                  <CircleAlertIcon aria-hidden className="size-4 shrink-0" />
                  Couldn’t load your to-dos. {state.reason}
                </p>
              </Message>
            )}
            {state._tag === 'Ready' && todos.length === 0 && (
              <Message>
                <p className="text-sm text-muted-foreground">
                  Nothing to do. Add your first to-do above.
                </p>
              </Message>
            )}
            {state._tag === 'Ready' && todos.length > 0 && (
              <ul className="divide-y divide-border">
                <AnimatePresence initial={false}>
                  {todos.map(({ key, view }) => (
                    <motion.li
                      key={key}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, transition: { duration: 0.12 } }}
                      transition={ENTER}
                    >
                      {view}
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </div>
          {state._tag === 'Ready' && (
            <footer className="flex items-center gap-2 border-t border-border bg-muted/40 px-4 py-2 text-sm">
              <span className="text-muted-foreground tabular-nums">
                {left} {left === 1 ? 'to-do' : 'to-dos'} left
              </span>
              <span className="ml-auto flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => send({ _tag: 'AllToggled' })}
                  className="text-muted-foreground"
                >
                  {allDone(self) ? 'Mark all not done' : 'Mark all done'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => send({ _tag: 'Filled' })}
                  className="text-muted-foreground"
                >
                  Add 50
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={model.done.length === 0}
                  onClick={() => send({ _tag: 'Cleared' })}
                  className="text-muted-foreground"
                >
                  Clear done
                </Button>
              </span>
            </footer>
          )}
        </div>
      </section>
    </MotionConfig>
  );
}
