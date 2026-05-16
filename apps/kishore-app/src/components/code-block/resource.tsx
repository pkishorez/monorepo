import { AnimatePresence, motion } from '@monorepo/frontend/motion';
import { Badge } from '@monorepo/frontend/components/ui/badge';
import { Effect } from 'effect';
import { useId, useRef, useState } from 'react';
import { Button } from '@monorepo/frontend/components/ui/button';
import { LucidePaintBucket } from '@monorepo/frontend/lucide';
import { cn } from '@monorepo/frontend/utils';
import { scrollBar } from '@monorepo/frontend/lib/scrollStyles';

export const useResourceMap = () => {
  const stateRef = useRef<Map<string, { state: 'open' | 'close' }>>(new Map());
  const [_, setReload] = useState(false);
  const reload = () => {
    setReload((r) => !r);
  };

  return {
    state: stateRef.current,
    reset: () => {
      stateRef.current = new Map();
      reload();
    },
    aquire: Effect.fn(function* (name: string, time = 300) {
      if (stateRef.current.get(name)) {
        yield* Effect.sleep(time); // simulate some work
        return yield* Effect.fail('resourceAlreadyExist' as const);
      }
      stateRef.current = stateRef.current.set(name, { state: 'open' });
      reload();

      yield* Effect.sleep(time); // simulate some work

      return {
        resource: null,
        release: Effect.gen(function* () {
          const existing = stateRef.current.get(name);
          if (!existing) {
            yield* Effect.sleep(time); // simulate some work
            return yield* Effect.fail('resourceDoNotExist');
          }
          const state = existing.state;
          if (state !== 'open') {
            yield* Effect.sleep(time); // simulate some work
            return yield* Effect.fail('resourceAlreadyClose');
          }
          existing.state = 'close';
          reload();

          yield* Effect.sleep(time); // simulate some work
        }).pipe(Effect.orDie),
      };
    }),
  };
};
export type ResourceResult = ReturnType<typeof useResourceMap>;
export type ResourceOptions = { aquireResource: ResourceResult['aquire'] };
export type Resource = Effect.Effect.Success<
  ReturnType<ResourceResult['aquire']>
>;

const MButton = motion.create(Button);
export function ResourceUI({
  result,
  className,
}: {
  result: ReturnType<typeof useResourceMap>;
  className?: string;
}) {
  const id = useId();
  const resources = Array.from(result.state.entries()).map(
    ([name, { state }]) => ({ name, state }),
  );
  const activeCount = resources.filter((v) => v.state === 'open').length;
  return (
    <div
      className={cn(
        'flex items-center gap-2 h-8 overflow-x-auto',
        className,
        scrollBar('small'),
      )}
    >
      <Badge
        variant="outline"
        className={cn(
          'opacity-100 transtion-opacity duration-200',
          'font-mono',
          {
            'opacity-30': activeCount === 0,
          },
        )}
      >
        Active: {activeCount}
      </Badge>
      <AnimatePresence>
        {resources.map(({ name, state }) => (
          <MButton
            key={`layout-${id}-${name}`}
            className={cn('h-6', {
              'line-through': state === 'close',
            })}
            initial={{ opacity: 0 }}
            animate={{ opacity: state === 'close' ? 0.3 : 1 }}
            exit={{ opacity: 0 }}
            variant="default"
          >
            <LucidePaintBucket />
            {name}
          </MButton>
        ))}
      </AnimatePresence>
    </div>
  );
}
