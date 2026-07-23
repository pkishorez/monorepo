import type {
  StoryRun,
  StoryPath,
  StoryTraceResult,
} from '../story/artifact/types.js';
import type { ProjectNarrative } from '../story/core/project-narrative.js';

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
  StoryPath,
  StoryScenario,
  StoryScenarioNodeCoverage,
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
  readonly stories: Readonly<Record<StoryPath, StoryRun>>;
}

export interface StoryCatalogStory {
  readonly storyPath: StoryPath;
  readonly storyKey: string;
  readonly modulePath: string;
  readonly name: string;
  readonly description: string;
  readonly documentation?: string;
  readonly scenarios?: readonly {
    readonly name: string;
    readonly description: string;
    readonly documentation?: string;
  }[];
}

export interface StoryCatalogModule {
  readonly modulePath: string;
  readonly description: string;
  readonly stories: readonly [StoryCatalogStory, ...StoryCatalogStory[]];
}

export interface StoryCatalog {
  readonly modules: readonly StoryCatalogModule[];
}

export interface StoryCollection {
  readonly catalog: StoryCatalog;
  readonly traces: Readonly<Record<StoryPath, StoryTraceResult>>;
  readonly project?: ProjectNarrative;
}

export type {
  ProjectMap,
  ProjectNarrative,
  ProjectNarrativeBlock,
  ProjectReference,
  ProjectTopic,
} from '../story/core/project-narrative.js';
