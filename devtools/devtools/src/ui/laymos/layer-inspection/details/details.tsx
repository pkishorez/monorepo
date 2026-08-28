import { cn } from '@monorepo/frontend/lib/utils';

import type { Layer } from '../../analysis-presentation';
import { layerEmptyState } from '../presentation';

interface LayerDetailsProps {
  readonly layer?: Layer;
  readonly className?: string;
}

export function LayerDetails({ layer, className }: LayerDetailsProps) {
  return (
    <div
      className={cn('min-h-16 text-foreground', className)}
      aria-live="polite"
    >
      {layer === undefined ? (
        <p className={layerEmptyState}>Select a layer</p>
      ) : (
        <div className="space-y-1.5">
          <h2 className="text-sm font-semibold tracking-tight">{layer.id}</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {layer.description ?? 'No description'}
          </p>
        </div>
      )}
    </div>
  );
}
