import type { LaymosStoriesReport, StoryId } from 'laymos/report';

export type LaymosStoriesSelection =
  | { readonly kind: 'story'; readonly storyId: StoryId }
  | {
      readonly kind: 'scenario';
      readonly storyId: StoryId;
      readonly scenarioIndex: number;
    }
  | null;

export type LaymosStoriesRunState =
  | { readonly kind: 'story'; readonly storyId: StoryId }
  | { readonly kind: 'all' }
  | null;

export interface LaymosStoriesProps {
  readonly storyIds: readonly StoryId[];
  readonly report: LaymosStoriesReport;
  readonly runState: LaymosStoriesRunState;
  readonly selection: LaymosStoriesSelection;
  readonly onSelectionChange: (selection: LaymosStoriesSelection) => void;
  readonly onRunStory?: (storyId: StoryId) => void;
  readonly onRunAll?: () => void;
  readonly className?: string;
  readonly ariaLabel?: string;
}
