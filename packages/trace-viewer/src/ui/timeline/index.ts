import {
  Timeline as TimelineComponent,
  type TimelineProps,
} from './timeline.js';
import { TimelineContent, type TimelineContentProps } from './content.js';
import { TimelineConfig, TimelineConfigDropdown } from '../controls/index.js';

// Create compound component
export const Timeline = Object.assign(TimelineComponent, {
  Content: TimelineContent,
  Config: TimelineConfig,
  DropdownConfig: TimelineConfigDropdown,
});

// Export individual components for advanced usage
export { TimelineContent } from './content.js';
export type { TimelineContentProps };
export type { TimelineProps };

// Export hooks for advanced customization
export {
  useTimelineContext,
  useOptionalTimelineContext,
  timelineContext,
  type TimelineContextValue,
} from './context.js';

// Re-export controls
export {
  TimelineConfig,
  TimelineConfigDropdown,
  LiveToggle,
  type TimelineConfigProps,
} from '../controls/index.js';
