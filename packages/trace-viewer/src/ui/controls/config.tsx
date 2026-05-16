import React, { useContext, useMemo } from 'react';
import { Button } from '@monorepo/frontend/components/ui/button';
import { Slider } from '@monorepo/frontend/components/ui/slider';
import { cn } from '@monorepo/frontend/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@monorepo/frontend/components/ui/dropdown-menu';
import {
  Settings,
  Layers,
  ZoomIn,
  ZoomOut,
  Minus,
  Plus,
  Eye,
  EyeOff,
  MousePointer,
  Hand,
  Info,
  MessageSquare,
} from '@monorepo/frontend/lucide';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Schema } from 'effect';
import { scrollbarStyles } from '@monorepo/frontend/lib/scrollStyles';
import { timelineContext } from '../timeline/context.js';
import type { GlobalConfig } from '../../types.js';

// ============================================================================
// Config Store (Zustand with localStorage persistence)
// ============================================================================

const LAYOUT_TYPES = ['base', 'compact'] as const;

const globalConfigSchema = Schema.Struct({
  secondInPxs: Schema.Number,
  layoutType: Schema.Literal('base', 'compact'),
  maxGapInPxs: Schema.Number,
  minSpanDurationInPxs: Schema.Number,
  isLive: Schema.Boolean,
  enableEvents: Schema.Boolean,
  enableHover: Schema.Boolean,
  enableSelect: Schema.Boolean,
  enableMeta: Schema.Boolean,
  enableTooltip: Schema.Boolean,
  enableLiveBar: Schema.Boolean,
  enableLiveGap: Schema.Boolean,
});

interface GlobalConfigStore {
  config: GlobalConfig;
  updateConfig: (config: Partial<GlobalConfig>) => void;
  toggleLive: () => void;
  cycleLayout: () => void;
}

// Default config values
const DEFAULT_CONFIG: GlobalConfig = {
  secondInPxs: 300,
  layoutType: 'compact',
  maxGapInPxs: 30,
  minSpanDurationInPxs: 30,
  isLive: false,
  enableEvents: true,
  enableHover: true,
  enableSelect: true,
  enableMeta: false,
  enableTooltip: true,
  enableLiveBar: true,
  enableLiveGap: true,
};

// Single global config store with persistence
export const useGlobalConfig = create<GlobalConfigStore>()(
  persist(
    (set) => ({
      config: DEFAULT_CONFIG,
      updateConfig: (config: Partial<GlobalConfig>) =>
        set((state) => ({
          config: { ...state.config, ...config },
        })),
      toggleLive: () =>
        set((state) => ({
          config: { ...state.config, isLive: !state.config.isLive },
        })),
      cycleLayout: () =>
        set((state) => {
          const currentIndex = LAYOUT_TYPES.indexOf(
            state.config.layoutType as (typeof LAYOUT_TYPES)[number],
          );
          const nextIndex = (currentIndex + 1) % LAYOUT_TYPES.length;
          return {
            config: { ...state.config, layoutType: LAYOUT_TYPES[nextIndex]! },
          };
        }),
    }),
    {
      name: 'timeline-config-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ config: state.config }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<GlobalConfigStore>;

        // Try to parse the persisted config with the schema
        const parseResult = Schema.decodeUnknownEither(globalConfigSchema)(
          persisted?.config,
        );

        if (parseResult._tag === 'Left') {
          // If parsing fails, return current state (default values)
          return currentState;
        }

        return {
          ...currentState,
          ...persisted,
        };
      },
    },
  ),
);

/**
 * Hook that returns the effective config by merging global config with forced config options
 */
export const useEffectiveConfig = (): GlobalConfig => {
  const config = useGlobalConfig((state) => state.config);
  const context = useContext(timelineContext);
  const { forceConfigOptions } = context;

  return useMemo(
    () => ({
      ...config,
      ...forceConfigOptions,
    }),
    [config, forceConfigOptions],
  );
};

// ============================================================================
// Config Types
// ============================================================================

export type ConfigVariant = 'all' | 'minimal';

export interface ConfigOptions {
  variant?: ConfigVariant;
  forceOptions?: Partial<GlobalConfig>;
  hideDisabled?: boolean;
}

export interface TimelineConfigProps {
  variant?: ConfigVariant;
  hideDisabled?: boolean;
  className?: string;
}

// ============================================================================
// Helper Components
// ============================================================================

const ToggleControl = ({
  label,
  isActive,
  onToggle,
  icon: Icon,
  disabled = false,
}: {
  label: string;
  isActive: boolean;
  onToggle: () => void;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
}) => (
  <div
    className={`flex items-center justify-between py-1 px-2 -mx-2 rounded-md cursor-pointer transition-colors ${
      disabled
        ? 'opacity-50 cursor-not-allowed'
        : 'hover:bg-muted/50 active:bg-muted'
    }`}
    onClick={disabled ? undefined : onToggle}
  >
    <span
      className={`text-xs font-medium ${disabled ? 'text-muted-foreground' : 'text-foreground'}`}
    >
      {label}
    </span>
    <Button
      size="sm"
      variant={isActive ? 'default' : 'ghost'}
      className={`h-6 w-6 p-0 transition-all pointer-events-none ${
        disabled ? 'opacity-70' : 'hover:scale-105'
      }`}
      disabled={disabled}
    >
      <Icon className="h-3 w-3" />
    </Button>
  </div>
);

const SliderControl = ({
  label,
  value,
  min,
  max,
  step,
  onValueChange,
  unit = '',
  leftIcon: LeftIcon,
  rightIcon: RightIcon,
  disabled = false,
  formatValue,
}: {
  label: string;
  value: number | number[];
  min: number;
  max: number;
  step: number;
  onValueChange: (value: number) => void;
  unit?: string;
  leftIcon: React.ComponentType<{ className?: string }>;
  rightIcon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  formatValue?: (value: number) => string;
}) => {
  const displayValue = typeof value === 'number' ? value : (value[0] ?? 0);
  const formattedValue = formatValue
    ? formatValue(displayValue)
    : `${Math.round(displayValue)}${unit}`;

  return (
    <div
      className={`space-y-2 p-2 rounded-md border transition-colors ${
        disabled
          ? 'bg-muted/10 border-border/20 opacity-60'
          : 'bg-muted/20 border-border/30'
      }`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`text-xs font-semibold ${
            disabled ? 'text-muted-foreground' : 'text-foreground'
          }`}
        >
          {label}
        </span>
        <div className="flex items-center gap-1">
          <span
            className={`text-xs font-mono px-1.5 py-0.5 rounded border ${
              disabled
                ? 'text-muted-foreground/70 bg-background/30 border-border/20'
                : 'text-muted-foreground bg-background/60 border-border/40'
            }`}
          >
            {formattedValue}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div
          className={`flex items-center justify-center w-6 h-6 rounded-full border transition-colors ${
            disabled
              ? 'bg-background/30 border-border/20 cursor-not-allowed'
              : 'bg-background/60 border-border/40 hover:bg-background/80 cursor-default'
          }`}
        >
          <LeftIcon
            className={`h-2.5 w-2.5 ${disabled ? 'text-muted-foreground/50' : 'text-muted-foreground'}`}
          />
        </div>
        <Slider
          value={value}
          min={min}
          max={max}
          step={step}
          onValueChange={(v) => {
            if (!disabled && typeof v === 'number') {
              onValueChange(v);
            } else if (!disabled && Array.isArray(v) && v[0] !== undefined) {
              onValueChange(v[0]);
            }
          }}
          disabled={disabled}
          className={`flex-1 ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
        />
        <div
          className={`flex items-center justify-center w-6 h-6 rounded-full border transition-colors ${
            disabled
              ? 'bg-background/30 border-border/20 cursor-not-allowed'
              : 'bg-background/60 border-border/40 hover:bg-background/80 cursor-default'
          }`}
        >
          <RightIcon
            className={`h-2.5 w-2.5 ${disabled ? 'text-muted-foreground/50' : 'text-muted-foreground'}`}
          />
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Layout Toggle
// ============================================================================

const LayoutToggle = () => {
  const config = useEffectiveConfig();
  const cycleLayout = useGlobalConfig((state) => state.cycleLayout);
  const context = useContext(timelineContext);
  const forceConfigOptions = context?.forceConfigOptions ?? {};
  const isLayoutDisabled = forceConfigOptions.layoutType !== undefined;

  const handleCycleLayout = () => {
    if (isLayoutDisabled) return;
    cycleLayout();
  };

  return (
    <Button
      size="sm"
      variant="ghost"
      className={`p-2 rounded-full transition-colors ${
        isLayoutDisabled ? 'opacity-60 cursor-not-allowed' : ''
      }`}
      onClick={handleCycleLayout}
      disabled={isLayoutDisabled}
    >
      <Layers
        className={`h-3.5 w-3.5 mr-1 ${
          isLayoutDisabled ? 'text-muted-foreground/50' : ''
        }`}
      />
      <span
        className={`text-xs ${
          isLayoutDisabled ? 'text-muted-foreground/70' : ''
        }`}
      >
        {config.layoutType}
      </span>
    </Button>
  );
};

// ============================================================================
// Zoom Control
// ============================================================================

const ZoomControl = ({ showDisabled = true }: { showDisabled?: boolean }) => {
  const config = useEffectiveConfig();
  const updateConfig = useGlobalConfig((state) => state.updateConfig);
  const context = useContext(timelineContext);
  const forceConfigOptions = context?.forceConfigOptions ?? {};
  const isZoomDisabled = forceConfigOptions.secondInPxs !== undefined;

  if (isZoomDisabled && !showDisabled) {
    return null;
  }

  return (
    <SliderControl
      label="Zoom"
      value={config.secondInPxs}
      min={20}
      max={500}
      step={10}
      onValueChange={(v) => updateConfig({ secondInPxs: v })}
      formatValue={(v) => `${v}px/s`}
      leftIcon={ZoomOut}
      rightIcon={ZoomIn}
      disabled={isZoomDisabled}
    />
  );
};

// ============================================================================
// Gap Control
// ============================================================================

const GapControl = ({ showDisabled = true }: { showDisabled?: boolean }) => {
  const config = useEffectiveConfig();
  const updateConfig = useGlobalConfig((state) => state.updateConfig);
  const context = useContext(timelineContext);
  const forceConfigOptions = context?.forceConfigOptions ?? {};
  const isGapDisabled = forceConfigOptions.maxGapInPxs !== undefined;

  if (isGapDisabled && !showDisabled) {
    return null;
  }

  return (
    <SliderControl
      label="Max Gap"
      value={config.maxGapInPxs}
      min={0}
      max={200}
      step={20}
      onValueChange={(v) => updateConfig({ maxGapInPxs: v })}
      unit="px"
      leftIcon={Minus}
      rightIcon={Plus}
      disabled={isGapDisabled}
    />
  );
};

// ============================================================================
// Span Duration Control
// ============================================================================

const SpanDurationControl = ({
  showDisabled = true,
}: {
  showDisabled?: boolean;
}) => {
  const config = useEffectiveConfig();
  const updateConfig = useGlobalConfig((state) => state.updateConfig);
  const context = useContext(timelineContext);
  const forceConfigOptions = context?.forceConfigOptions ?? {};
  const isSpanDurationDisabled =
    forceConfigOptions.minSpanDurationInPxs !== undefined;

  if (isSpanDurationDisabled && !showDisabled) {
    return null;
  }

  return (
    <SliderControl
      label="Min Span Duration"
      value={config.minSpanDurationInPxs}
      min={0}
      max={200}
      step={10}
      onValueChange={(v) => updateConfig({ minSpanDurationInPxs: v })}
      unit="px"
      leftIcon={Minus}
      rightIcon={Plus}
      disabled={isSpanDurationDisabled}
    />
  );
};

// ============================================================================
// Minimal Zoom Slider
// ============================================================================

const MinimalZoomSlider = () => {
  const config = useEffectiveConfig();
  const updateConfig = useGlobalConfig((state) => state.updateConfig);
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
    <div className="flex items-center gap-2 bg-background/80 backdrop-blur-sm border rounded-lg p-2 shadow-lg">
      <Button
        size="sm"
        variant={config.isLive && !isLiveDisabled ? 'default' : 'ghost'}
        className={`h-7 px-3 gap-1.5 transition-colors ${
          isLiveDisabled ? 'opacity-60 cursor-not-allowed' : ''
        }`}
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
        <span
          className={`text-xs font-medium ${
            isLiveDisabled ? 'text-muted-foreground/70' : ''
          }`}
        >
          Live
        </span>
      </Button>
      <ZoomOut className="h-4 w-4 text-muted-foreground/70" />
      <Slider
        value={config.secondInPxs}
        min={20}
        max={120}
        step={10}
        onValueChange={(v) =>
          typeof v === 'number' && updateConfig({ secondInPxs: v })
        }
        className="flex-1 cursor-pointer w-24"
      />
      <ZoomIn className="h-4 w-4 text-muted-foreground/70" />
    </div>
  );
};

// ============================================================================
// Timeline Config Dropdown
// ============================================================================

export const TimelineConfigDropdown = ({
  showDisabled = false,
  variant = 'all',
  className,
}: {
  showDisabled?: boolean;
  variant?: 'all' | 'minimal';
  className?: string;
}) => {
  const config = useEffectiveConfig();
  const updateConfig = useGlobalConfig((state) => state.updateConfig);
  const context = useContext(timelineContext);
  const forceConfigOptions = context?.forceConfigOptions ?? {};

  const isEventsDisabled = forceConfigOptions.enableEvents !== undefined;
  const isMetaDisabled = forceConfigOptions.enableMeta !== undefined;
  const isTooltipDisabled = forceConfigOptions.enableTooltip !== undefined;
  const isHoverDisabled = forceConfigOptions.enableHover !== undefined;
  const isSelectDisabled = forceConfigOptions.enableSelect !== undefined;
  const isLiveBarDisabled = forceConfigOptions.enableLiveBar !== undefined;
  const isLiveGapDisabled = forceConfigOptions.enableLiveGap !== undefined;

  const isZoomDisabled = forceConfigOptions.secondInPxs !== undefined;
  const isGapDisabled = forceConfigOptions.maxGapInPxs !== undefined;
  const isSpanDurationDisabled =
    forceConfigOptions.minSpanDurationInPxs !== undefined;

  const shouldShowZoom = showDisabled || !isZoomDisabled;
  const shouldShowGap = showDisabled || !isGapDisabled;
  const shouldShowSpanDuration = showDisabled || !isSpanDurationDisabled;
  const shouldShowTimelineControls =
    shouldShowZoom || shouldShowGap || shouldShowSpanDuration;

  const toggleControls = [
    {
      key: 'events',
      label: 'Events',
      isActive: config.enableEvents,
      onToggle: () => updateConfig({ enableEvents: !config.enableEvents }),
      icon: config.enableEvents ? Eye : EyeOff,
      disabled: isEventsDisabled,
    },
    {
      key: 'meta',
      label: 'Meta Info',
      isActive: config.enableMeta,
      onToggle: () => updateConfig({ enableMeta: !config.enableMeta }),
      icon: Info,
      disabled: isMetaDisabled,
    },
    {
      key: 'tooltip',
      label: 'Tooltips',
      isActive: config.enableTooltip,
      onToggle: () => updateConfig({ enableTooltip: !config.enableTooltip }),
      icon: MessageSquare,
      disabled: isTooltipDisabled,
    },
    {
      key: 'liveBar',
      label: 'Live Bar',
      isActive: config.enableLiveBar,
      onToggle: () => updateConfig({ enableLiveBar: !config.enableLiveBar }),
      icon: config.enableLiveBar ? Eye : EyeOff,
      disabled: isLiveBarDisabled,
    },
    {
      key: 'liveGap',
      label: 'Live Gap',
      isActive: config.enableLiveGap,
      onToggle: () => updateConfig({ enableLiveGap: !config.enableLiveGap }),
      icon: config.enableLiveGap ? Eye : EyeOff,
      disabled: isLiveGapDisabled,
    },
  ];

  const toggleControlsUI = toggleControls
    .filter((v) => !v.disabled || showDisabled)
    .map((control) => (
      <ToggleControl
        key={control.key}
        label={control.label}
        isActive={control.isActive}
        onToggle={control.onToggle}
        icon={control.icon}
        disabled={control.disabled}
      />
    ));

  const interactionControls = [
    {
      key: 'hover',
      label: 'Hover',
      isActive: config.enableHover,
      onToggle: () => updateConfig({ enableHover: !config.enableHover }),
      icon: MousePointer,
      disabled: isHoverDisabled,
    },
    {
      key: 'select',
      label: 'Select',
      isActive: config.enableSelect,
      onToggle: () => updateConfig({ enableSelect: !config.enableSelect }),
      icon: Hand,
      disabled: isSelectDisabled,
    },
  ];

  const interactionControlsUI = interactionControls
    .filter((v) => !v.disabled || showDisabled)
    .map((control) => (
      <ToggleControl
        key={control.key}
        label={control.label}
        isActive={control.isActive}
        onToggle={control.onToggle}
        icon={control.icon}
        disabled={control.disabled}
      />
    ));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            size="sm"
            variant="ghost"
            className={cn(
              'p-2 rounded-full bg-background/80 backdrop-blur-sm border border-border/40 shadow-sm hover:bg-background/90',
              className,
            )}
          >
            <Settings className="h-4 w-4" />
          </Button>
        }
      />
      <DropdownMenuContent
        className={cn(
          'min-w-75 p-0 bg-background text-foreground border shadow-xl',
          scrollbarStyles,
        )}
      >
        <div className="p-3 space-y-3">
          <div className="flex items-center gap-2">
            <LiveToggleInline />
            {variant === 'all' && <LayoutToggle />}
          </div>

          {shouldShowTimelineControls && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Timeline Controls
              </div>
              <ZoomControl showDisabled={showDisabled} />
              <GapControl showDisabled={showDisabled} />
              <SpanDurationControl showDisabled={showDisabled} />
            </div>
          )}

          {toggleControlsUI.length > 0 && (
            <div className="border-t border-border/50 pt-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                Visual Elements
              </div>
              {toggleControlsUI}
            </div>
          )}

          {interactionControlsUI.length > 0 && (
            <div className="border-t border-border/50 pt-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                Interactions
              </div>
              {interactionControlsUI}
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

// ============================================================================
// Live Toggle (inline version for dropdown)
// ============================================================================

const LiveToggleInline = ({ className }: { className?: string }) => {
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

// ============================================================================
// Timeline Config Component
// ============================================================================

/**
 * Standalone TimelineConfig component that can work both inside Timeline wrapper or independently.
 *
 * When used within TimelineWrapper, it automatically gets refs from context.
 * When used independently, it provides default behavior for all functionality.
 *
 * Usage within TimelineWrapper:
 * ```tsx
 * <TimelineWrapper tracerRef={tracerRef}>
 *   <div className="flex justify-between mb-4">
 *     <h2>My Trace</h2>
 *     <TimelineConfig variant="minimal" />
 *   </div>
 *   <TimelineContent />
 * </TimelineWrapper>
 * ```
 *
 * Usage independently:
 * ```tsx
 * <TimelineConfig
 *   variant="all"
 *   configOptions={{ forceOptions: { isLive: false } }}
 * />
 * ```
 */
export function TimelineConfig({
  variant = 'all',
  hideDisabled = false,
  className,
}: TimelineConfigProps) {
  if (variant === 'minimal') {
    return (
      <div className={className}>
        <MinimalZoomSlider />
      </div>
    );
  }

  return (
    <div className={className}>
      <TimelineConfigDropdown showDisabled={hideDisabled} variant={variant} />
    </div>
  );
}
