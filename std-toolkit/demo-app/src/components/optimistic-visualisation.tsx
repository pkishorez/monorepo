import { todoCollection } from '@/frontend/collection';
import { cn } from '@/frontend/utils';
import { AnimatePresence, HTMLMotionProps, motion } from 'motion/react';

interface OptimisticVisualisationProps {
  _optimisticState: Exclude<
    (typeof todoCollection.TypeWithOptimistic)['_optimisticState'],
    undefined
  >;
}

type BoxType = 'insertion' | 'updating' | 'queued';

interface Box {
  id: string;
  type: BoxType;
}

export function OptimisticVisualisation({
  _optimisticState,
}: OptimisticVisualisationProps) {
  const { errorCount, insertionInProgress, updatesInProgress, updates } =
    _optimisticState;

  return (
    <div className="flex items-center gap-1.5">
      {insertionInProgress && <Box className={`bg-green-500 animate-pulse`} />}
      <div
        className={cn('relative flex gap-[1px]', {
          'mr-1.5': updatesInProgress.length > 1 && updates.length > 0,
        })}
      >
        <motion.div
          layout
          className={cn(
            'absolute -inset-x-1 -inset-y-1 border-2 border-orange-500 transform-border rounded-sm animate-pulse',
            {
              'border-transparent bg-transparent':
                updatesInProgress.length <= 1,
            },
          )}
        />
        {updatesInProgress.map((update) => (
          <Box
            layoutId={update.id}
            key={update.id}
            exit={{ opacity: 0 }}
            className={`bg-orange-500`}
          />
        ))}
      </div>
      {updates.map((update) => (
        <Box layoutId={update.id} key={update.id} className={`bg-gray-400`} />
      ))}
      {errorCount > 0 && (
        <div className="text-red-700 font-bold text-sm">{errorCount}</div>
      )}
    </div>
  );
}

const Box = ({
  className,
  ...props
}: { id?: string; className?: string } & HTMLMotionProps<'div'>) => {
  return (
    <motion.div
      {...props}
      className={cn(
        `w-2.5 h-2.5 rounded-sm shadow-sm shadow-gray-400 transition-colors duration-200`,
        className,
      )}
    />
  );
};
