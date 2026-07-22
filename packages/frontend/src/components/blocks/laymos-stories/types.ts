import type {
  StoriesRun,
  StoryCollection,
  StoryGroupPath,
  StoryId,
} from 'laymos/report';

export type LaymosStoriesSelection =
  | { readonly kind: 'group'; readonly groupPath: StoryGroupPath }
  | { readonly kind: 'story'; readonly storyId: StoryId }
  | {
      readonly kind: 'scenario';
      readonly storyId: StoryId;
      readonly scenarioIndex: number;
    }
  | null;

export type LaymosStoriesRunState =
  | { readonly kind: 'group'; readonly groupPath: StoryGroupPath }
  | { readonly kind: 'story'; readonly storyId: StoryId }
  | { readonly kind: 'all' }
  | null;

export type LaymosStoriesSidebarExpansion = 'single' | 'recursive';

export type LaymosStoryExecutionState =
  | { readonly status: 'loading' }
  | { readonly status: 'success' }
  | { readonly status: 'error'; readonly message: string };

export interface LaymosStoriesProps {
  readonly collection: StoryCollection;
  readonly runs: StoriesRun;
  readonly storyStates?: Readonly<
    Partial<Record<StoryId, LaymosStoryExecutionState>>
  >;
  readonly runState: LaymosStoriesRunState;
  readonly selection: LaymosStoriesSelection;
  readonly onSelectionChange: (selection: LaymosStoriesSelection) => void;
  readonly onRunStory?: (storyId: StoryId) => void;
  readonly onRunGroup?: (groupPath: StoryGroupPath) => void;
  readonly onRunAll?: () => void;
  readonly sidebarExpansion?: LaymosStoriesSidebarExpansion;
  readonly className?: string;
  readonly ariaLabel?: string;
}
