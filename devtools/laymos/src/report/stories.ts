import type { StoryArtifact, StoryId } from '../story/artifact/types.js';

export type {
  BlockId,
  ExecutionItem,
  ExecutionPath,
  ScenarioOutcome,
  StoryArm,
  StoryArtifact,
  StoryBlock,
  StoryBlockVisitOutcome,
  StoryDecisionValue,
  StoryId,
  StoryScenario,
  StoryScenarioFailure,
  StoryScenarioFailurePhase,
  StorySelectedArm,
  StorySourceLocation,
} from '../story/artifact/types.js';

export interface LaymosStoriesReport {
  readonly stories: Readonly<Record<StoryId, StoryArtifact>>;
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
