import type {
  ProjectReference,
  StoriesRun,
  StoryCollection,
  StoryPath,
} from 'laymos/report';
import type { ReactNode } from 'react';
import type { StoryGraphNode } from './lib/model';

export type LaymosStoriesSelection =
  | { readonly kind: 'project-narrative' }
  | { readonly kind: 'catalog' }
  | { readonly kind: 'module'; readonly modulePath: string }
  | { readonly kind: 'story'; readonly storyPath: StoryPath }
  | {
      readonly kind: 'scenario';
      readonly storyPath: StoryPath;
      readonly scenarioIndex: number;
    }
  | null;

export type LaymosStoriesRunState =
  | { readonly kind: 'module'; readonly modulePath: string }
  | { readonly kind: 'story'; readonly storyPath: StoryPath }
  | { readonly kind: 'all' }
  | null;

export interface LaymosStoryCanvasPreferences {
  readonly showDetails: boolean;
  readonly showFunctionScopes: boolean;
  readonly showDescriptionPopover: boolean;
  readonly centerSelected: boolean;
}

export type LaymosStoryExecutionState =
  | { readonly status: 'loading' }
  | { readonly status: 'success' }
  | { readonly status: 'error'; readonly message: string };

export interface LaymosStoriesProps {
  readonly collection: StoryCollection;
  readonly runs: StoriesRun;
  readonly storyStates?: Readonly<
    Partial<Record<StoryPath, LaymosStoryExecutionState>>
  >;
  readonly runState: LaymosStoriesRunState;
  readonly selection: LaymosStoriesSelection;
  readonly onSelectionChange: (selection: LaymosStoriesSelection) => void;
  readonly selectedNodeId?: string | null;
  readonly onSelectedNodeIdChange?: (nodeId: string | null) => void;
  readonly onHoveredNodeIdChange?: (nodeId: string | null) => void;
  readonly onNodeClick?: (
    node: StoryGraphNode,
    context: { readonly modified: boolean },
  ) => void;
  readonly onGraphNodesChange?: (nodes: readonly StoryGraphNode[]) => void;
  readonly centerNodeRequest?: {
    readonly nodeId: string;
    readonly requestId: number;
  } | null;
  readonly renderNodeActions?: (node: StoryGraphNode) => ReactNode;
  readonly onRunModule?: (modulePath: string) => void;
  readonly onRunStory?: (storyPath: StoryPath) => void;
  readonly onRunAll?: () => void;
  readonly onProjectReferenceClick?: (reference: ProjectReference) => void;
  readonly defaultStoryView?: 'narrative' | 'graph';
  readonly graphOnly?: boolean;
  readonly canvasPreferences?: LaymosStoryCanvasPreferences;
  readonly onCanvasPreferencesChange?: (
    preferences: LaymosStoryCanvasPreferences,
  ) => void;
  readonly showNavigator?: boolean;
  readonly className?: string;
  readonly ariaLabel?: string;
}
