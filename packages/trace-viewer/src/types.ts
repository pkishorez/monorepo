import { SubscriptionRef } from 'effect';
import { tracerSpanSchema } from './core/schema.js';

// ============================================================================
// Tracer Subscription Types
// ============================================================================

export type TracerSpanSubscriptionValue = {
  i: number;
  value: (typeof tracerSpanSchema.Type)[];
};

export type TracerSpanSubscriptionRef =
  SubscriptionRef.SubscriptionRef<TracerSpanSubscriptionValue>;

// ============================================================================
// Config Types
// ============================================================================

export interface GlobalConfig {
  // Zoom & Layout
  secondInPxs: number;
  layoutType: 'base' | 'compact';
  maxGapInPxs: number;
  minSpanDurationInPxs: number;

  // Features
  enableHover: boolean;
  enableTooltip: boolean;
  enableMeta: boolean;
  enableSelect: boolean;
  enableEvents: boolean;

  // Live Mode
  isLive: boolean;
  enableLiveBar: boolean;
  enableLiveGap: boolean;
}

// ============================================================================
// Re-export core types
// ============================================================================

export type {
  LayoutSpan,
  AllLayoutResults,
  LayoutType,
} from './core/layout.js';
export type { ExitStatus } from './core/schema.js';
