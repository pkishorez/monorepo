export type StoryPath = string;
export type BlockId = string;
export type StoryVisibility = 'primary' | 'detail';

export interface StorySourceLocation {
  readonly file: string;
  readonly line: number;
  readonly endLine?: number;
  readonly column: number;
}

interface StoryBlockBase {
  readonly name: string;
  readonly description: string;
  readonly location: StorySourceLocation;
  readonly visibility?: StoryVisibility;
  readonly modulePath?: string;
}

export type StoryDecisionRole = 'value' | 'control-flow';

export type StoryDecisionValue = string | number | boolean | null;

export type StoryTerminalCompletion =
  | { readonly kind: 'success' }
  | { readonly kind: 'error'; readonly error: string };

export type StoryArm =
  | {
      readonly kind: 'literal';
      readonly value: StoryDecisionValue;
      readonly name: string;
      readonly description: string;
      readonly visibility?: StoryVisibility;
      readonly location?: StorySourceLocation;
      readonly errors?: readonly string[];
      readonly completion?: StoryTerminalCompletion;
    }
  | {
      readonly kind: 'otherwise';
      readonly name: string;
      readonly description: string;
      readonly visibility?: StoryVisibility;
      readonly location?: StorySourceLocation;
      readonly errors?: readonly string[];
      readonly completion?: StoryTerminalCompletion;
    };

export type StoryBlock =
  | (StoryBlockBase & { readonly kind: 'flow' | 'step' })
  | (StoryBlockBase & {
      readonly kind: 'terminal';
      readonly completion?: StoryTerminalCompletion;
    })
  | (StoryBlockBase & {
      readonly kind: 'decision';
      readonly role?: StoryDecisionRole;
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
      readonly terminalMismatch?: boolean;
      readonly children: ExecutionPath;
    }
  | { readonly parallel: readonly ExecutionPath[] };

export interface StoryScenario {
  readonly name: string;
  readonly description: string;
  readonly documentation?: string;
  readonly location: StorySourceLocation;
  readonly outcome: ScenarioOutcome;
  readonly startedAt?: number;
  readonly durationMillis?: number;
  readonly execution: ExecutionPath;
  readonly failures: readonly StoryScenarioFailure[];
}

export interface StoryRun {
  readonly generatedAt: number;
  readonly name: string;
  readonly description: string;
  readonly documentation?: string;
  readonly blocks: Readonly<Record<BlockId, StoryBlock>>;
  readonly scenarios: readonly StoryScenario[];
  readonly scenarioNodeCoverage?: StoryScenarioNodeCoverage;
}

export interface StoryScenarioNodeCoverage {
  readonly visited: number;
  readonly total: number;
  readonly percentage: number;
}

export interface StoryTraceOptions {
  readonly concurrency?: number | 'unbounded' | 'inherit';
  readonly discard?: boolean;
  readonly mode?: 'default' | 'result';
}

export type StoryTracePath = readonly StoryTraceItem[];

export type StoryTraceItem =
  | {
      readonly kind: 'flow';
      readonly blockId: BlockId;
      readonly children: StoryTracePath;
    }
  | { readonly kind: 'flow-reference'; readonly blockId: BlockId }
  | { readonly kind: 'step'; readonly blockId: BlockId }
  | { readonly kind: 'terminal'; readonly blockId: BlockId }
  | {
      readonly kind: 'decision';
      readonly blockId: BlockId;
      readonly selector?: StoryTracePath;
      readonly arms: readonly {
        readonly arm: StoryArm;
        readonly children: StoryTracePath;
      }[];
    }
  | {
      readonly kind: 'all';
      readonly options: StoryTraceOptions;
      readonly branches: readonly StoryTracePath[];
    }
  | {
      readonly kind: 'for-each';
      readonly options: StoryTraceOptions;
      readonly body: StoryTracePath;
    }
  | {
      readonly kind: 'omission';
      readonly location: StorySourceLocation;
      readonly reason: string;
    };

export interface StoryTrace {
  readonly status: 'valid';
  readonly generatedAt: number;
  readonly blocks: Readonly<Record<BlockId, StoryBlock>>;
  readonly execution: StoryTracePath;
  readonly definitions: Readonly<Record<BlockId, StoryTracePath>>;
}

export interface StoryTraceFailure {
  readonly status: 'invalid';
  readonly message: string;
  readonly execution: StoryTracePath;
  readonly blocks: Readonly<Record<BlockId, StoryBlock>>;
}

export type StoryTraceResult = StoryTrace | StoryTraceFailure;
