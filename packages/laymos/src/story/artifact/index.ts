import type { Attrs } from '../core/types.js';

export interface BlockRecord {
  readonly name: string;
  readonly blockKind: 'story-fn' | 'step' | 'decision';
  readonly description?: string;
  readonly location?: string;
  readonly arms?: readonly string[];
}

export interface TraceEvent {
  readonly type: 'enter' | 'exit';
  readonly block: string;
  readonly blockKind: 'story-fn' | 'step' | 'decision';
  readonly arm?: string;
  readonly attrs?: Attrs;
}

export interface PathTrace {
  readonly path: string;
  readonly passed: boolean;
  readonly events: readonly TraceEvent[];
}

export interface StoryArtifact {
  readonly story: string;
  readonly file: string;
  readonly blocks: readonly BlockRecord[];
  readonly paths: readonly PathTrace[];
  readonly unvisitedArms: readonly {
    readonly block: string;
    readonly arm: string;
  }[];
}

export interface LogLine {
  readonly story?: string;
  readonly block: string;
  readonly arm?: string;
  readonly attrs?: Attrs;
  readonly ts: number;
}
