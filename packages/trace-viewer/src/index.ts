// ============================================================================
// Main exports
// ============================================================================

export { Timeline } from './ui/timeline/index.js';
export { createTracerWatcher } from './core/watcher.js';

// ============================================================================
// UI Components
// ============================================================================

export {
  TimelineContent,
  TimelineConfig,
  TimelineConfigDropdown,
  LiveToggle,
  useTimelineContext,
  useOptionalTimelineContext,
} from './ui/timeline/index.js';

// ============================================================================
// Types
// ============================================================================

export type {
  GlobalConfig,
  TracerSpanSubscriptionRef,
  TracerSpanSubscriptionValue,
  LayoutSpan,
  AllLayoutResults,
  LayoutType,
  ExitStatus,
} from './types.js';

export type {
  TimelineProps,
  TimelineContentProps,
  TimelineContextValue,
  TimelineConfigProps,
} from './ui/timeline/index.js';

export type { ConfigVariant, ConfigOptions } from './ui/controls/index.js';

// ============================================================================
// Advanced (for custom implementations)
// ============================================================================

export {
  computeLayout,
  millisToPxs,
  pxsToMillis,
  getHierarchy,
  calculateHoveredSpanMap,
} from './core/layout.js';
export {
  tracerSpanSchema,
  TimeInMillis,
  getExitStatus,
} from './core/schema.js';
export { useEffectiveConfig, useGlobalConfig } from './ui/controls/config.js';
