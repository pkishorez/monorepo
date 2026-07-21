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
