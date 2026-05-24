import { cn } from '#lib/utils';

import type { ViewMode } from '../types';

type ViewToggleProps = {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  hasFeatures: boolean;
};

export function ViewToggle({
  viewMode,
  onViewModeChange,
  hasFeatures,
}: ViewToggleProps) {
  return (
    <div className="absolute top-3 left-3 z-10 flex rounded-md border border-border bg-background/90 backdrop-blur-sm">
      <button
        onClick={() => onViewModeChange('layers')}
        className={cn(
          'rounded-l-md px-3 py-1.5 text-xs font-medium transition-colors',
          viewMode === 'layers'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        Layers
      </button>
      <button
        onClick={() => hasFeatures && onViewModeChange('features')}
        disabled={!hasFeatures}
        className={cn(
          'rounded-r-md border-l border-border px-3 py-1.5 text-xs font-medium transition-colors',
          viewMode === 'features'
            ? 'bg-primary text-primary-foreground'
            : hasFeatures
              ? 'text-muted-foreground hover:text-foreground'
              : 'cursor-not-allowed text-muted-foreground/30',
        )}
      >
        Features
      </button>
    </div>
  );
}
