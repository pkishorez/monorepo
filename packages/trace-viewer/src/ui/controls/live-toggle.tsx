import React, { useContext } from 'react';
import { Button } from '@monorepo/frontend/components/ui/button';
import { cn } from '@monorepo/frontend/utils';
import { timelineContext } from '../timeline/context.js';
import { useGlobalConfig, useEffectiveConfig } from './config.js';

export interface LiveToggleProps {
  className?: string;
}

export const LiveToggle = ({ className }: LiveToggleProps) => {
  const config = useEffectiveConfig();
  const toggleLive = useGlobalConfig((state) => state.toggleLive);
  const context = useContext(timelineContext);
  const containerRef = context?.containerRef;
  const gridRef = context?.gridRef;
  const forceConfigOptions = context?.forceConfigOptions ?? {};
  const isLiveDisabled = forceConfigOptions.isLive !== undefined;

  const handleToggleLive = () => {
    if (isLiveDisabled) return;

    if (config.isLive && containerRef?.current && gridRef?.current) {
      gridRef.current.classList.remove('float-right');
      containerRef.current.scrollLeft = containerRef.current.scrollWidth;
    }
    toggleLive();
  };

  return (
    <Button
      size="sm"
      variant={config.isLive && !isLiveDisabled ? 'outline' : 'ghost'}
      className={cn(
        `p-3 rounded-full gap-1.5 transition-colors ${
          isLiveDisabled ? 'opacity-60 cursor-not-allowed' : ''
        }`,
        className,
      )}
      onClick={handleToggleLive}
      disabled={isLiveDisabled}
    >
      <div
        className={`w-2 h-2 rounded-full ${
          isLiveDisabled
            ? 'bg-muted-foreground/30'
            : config.isLive
              ? 'bg-green-500 animate-pulse'
              : 'bg-muted-foreground/50'
        }`}
      />
    </Button>
  );
};
