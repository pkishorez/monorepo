import { todoCollection } from '@/frontend/collection';
import { motion } from 'motion/react';
import { useMemo } from 'react';

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

  const boxes = useMemo(() => {
    const result: Box[] = [];

    if (insertionInProgress) {
      result.push({ id: 'insertion', type: 'insertion' });
    }

    updatesInProgress.forEach((v) => {
      result.push({ id: v.id, type: 'updating' });
    });

    updates.forEach((v) => {
      result.push({ id: v.id, type: 'queued' });
    });

    return result.reverse();
  }, [_optimisticState]);

  const getBoxStyles = (type: BoxType) => {
    switch (type) {
      case 'insertion':
        return 'bg-green-500 animate-pulse';
      case 'updating':
        return 'bg-orange-500 animate-pulse';
      case 'queued':
        return 'bg-gray-400';
    }
  };

  const getBoxTitle = (type: BoxType) => {
    switch (type) {
      case 'insertion':
        return 'Inserting...';
      case 'updating':
        return 'Updating...';
      case 'queued':
        return 'Queued...';
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      {boxes.map((box) => (
        <motion.div
          key={box.id}
          layout
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={`w-2.5 h-2.5 rounded-sm shadow-sm ${getBoxStyles(box.type)} transition-colors duration-200`}
          title={getBoxTitle(box.type)}
        />
      ))}
      {errorCount > 0 && (
        <div className="text-red-700 font-bold text-sm">{errorCount}</div>
      )}
    </div>
  );
}
