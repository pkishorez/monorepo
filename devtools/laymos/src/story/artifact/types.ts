export type StoryId = string;
export type BlockId = string;

export interface StorySourceLocation {
  readonly file: string;
  readonly line: number;
  readonly column: number;
}

interface StoryBlockBase {
  readonly name: string;
  readonly description: string;
  readonly location: StorySourceLocation;
}

export type StoryDecisionValue = string | number | boolean;

export type StoryArm =
  | {
      readonly kind: 'literal';
      readonly value: StoryDecisionValue;
      readonly name: string;
      readonly description: string;
    }
  | {
      readonly kind: 'otherwise';
      readonly name: string;
      readonly description: string;
    };

export type StoryBlock =
  | (StoryBlockBase & { readonly kind: 'block' })
  | (StoryBlockBase & {
      readonly kind: 'decision';
      readonly arms: readonly StoryArm[];
    });

export type ScenarioOutcome =
  | 'succeeded'
  | 'failed'
  | 'interrupted'
  | 'skipped';

export type StoryScenarioFailurePhase =
  | 'preparation'
  | 'execution'
  | 'verification'
  | 'cleanup';

export interface StoryScenarioFailure {
  readonly phase: StoryScenarioFailurePhase;
  readonly message: string;
}

export type StoryBlockVisitOutcome = 'succeeded' | 'failed' | 'interrupted';

export type StorySelectedArm =
  | { readonly kind: 'literal'; readonly value: StoryDecisionValue }
  | { readonly kind: 'otherwise' };

export type ExecutionPath = readonly ExecutionItem[];

export type ExecutionItem =
  | {
      readonly blockId: BlockId;
      readonly outcome: StoryBlockVisitOutcome;
      readonly startOffsetMillis: number;
      readonly durationMillis: number;
      readonly selectedArm?: StorySelectedArm;
      readonly attributes?: Readonly<Record<string, unknown>>;
      readonly children: ExecutionPath;
    }
  | { readonly parallel: readonly ExecutionPath[] };

export interface StoryScenario {
  readonly name: string;
  readonly description: string;
  readonly location: StorySourceLocation;
  readonly outcome: ScenarioOutcome;
  readonly startedAt?: number;
  readonly durationMillis?: number;
  readonly execution: ExecutionPath;
  readonly failures: readonly StoryScenarioFailure[];
}

export interface StoryArtifact {
  readonly schemaVersion: 3;
  readonly generatedAt: number;
  readonly name: string;
  readonly description: string;
  readonly blocks: Readonly<Record<BlockId, StoryBlock>>;
  readonly scenarios: readonly StoryScenario[];
}
