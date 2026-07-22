import type {
  StoryRun,
  StoryId,
  StoryTraceResult,
} from '../story/artifact/types.js';

export type {
  BlockId,
  ExecutionItem,
  ExecutionPath,
  ScenarioOutcome,
  StoryArm,
  StoryRun,
  StoryBlock,
  StoryBlockVisitOutcome,
  StoryDecisionValue,
  StoryId,
  StoryScenario,
  StoryScenarioFailure,
  StoryScenarioFailurePhase,
  StorySelectedArm,
  StorySourceLocation,
  StoryTrace,
  StoryTraceFailure,
  StoryTraceItem,
  StoryTraceOptions,
  StoryTracePath,
  StoryTraceResult,
  StoryTerminalCompletion,
  StoryVisibility,
} from '../story/artifact/types.js';

export interface StoriesRun {
  readonly stories: Readonly<Record<StoryId, StoryRun>>;
}

export type StoryGroupPath = readonly string[];

export interface StoryCatalogGroup {
  readonly path: StoryGroupPath;
  readonly name: string;
  readonly description: string;
}

export interface StoryCatalogStory {
  readonly storyId: StoryId;
  readonly name: string;
  readonly description: string;
  readonly groupPath: StoryGroupPath;
}

export interface StoryCatalog {
  readonly groups: readonly StoryCatalogGroup[];
  readonly stories: readonly StoryCatalogStory[];
}

export interface StoryCollection {
  readonly catalog: StoryCatalog;
  readonly traces: Readonly<Record<StoryId, StoryTraceResult>>;
}
