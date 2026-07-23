import { Context } from 'effect';

import type {
  Attributes,
  AttributesInput,
  DecisionValue,
  TerminalCompletion,
  Visibility,
} from './types.js';

export interface SourceLocation {
  readonly file: string;
  readonly line: number;
  readonly column: number;
}

export interface BlockDeclaration {
  readonly name: string;
  readonly description: string;
  readonly kind: 'flow' | 'step' | 'decision' | 'terminal';
  readonly visibility: Visibility;
  readonly location: SourceLocation;
  readonly completion?: TerminalCompletion;
}

export type ArmDeclaration =
  | {
      readonly kind: 'literal';
      readonly value: DecisionValue;
      readonly name: string;
      readonly description: string;
      readonly visibility: Visibility;
      readonly location: SourceLocation;
      readonly errors?: readonly string[];
      readonly completion?: TerminalCompletion;
    }
  | {
      readonly kind: 'otherwise';
      readonly name: string;
      readonly description: string;
      readonly visibility: Visibility;
      readonly location: SourceLocation;
      readonly errors?: readonly string[];
      readonly completion?: TerminalCompletion;
    };

export type SelectedArm =
  | { readonly kind: 'literal'; readonly value: DecisionValue }
  | { readonly kind: 'otherwise' };

export interface StoryRecorder {
  declareArm(block: BlockDeclaration, arm: ArmDeclaration): void;
  start(
    block: BlockDeclaration,
    selectedArm: SelectedArm | undefined,
    selectedArmDeclaration: ArmDeclaration | undefined,
    attributes: Attributes | undefined,
    parent: unknown,
    branch: unknown,
  ): unknown;
  finish(token: unknown, outcome: 'succeeded' | 'failed' | 'interrupted'): void;
}

export const CurrentRecorder = Context.Reference<StoryRecorder | undefined>(
  'laymos/story/current-recorder',
  { defaultValue: () => undefined },
);

export const rootStoryBranch = Symbol('laymos/story/root-branch');

export const CurrentStoryBranch = Context.Reference<unknown>(
  'laymos/story/current-branch',
  { defaultValue: () => rootStoryBranch },
);

export function resolveAttributes<Args extends readonly unknown[]>(
  input: AttributesInput<Args> | undefined,
  args: Args,
): Attributes | undefined {
  if (input === undefined) return undefined;
  return typeof input === 'function' ? input(...args) : input;
}

export function captureLocation(): SourceLocation {
  const stack = new Error().stack?.split('\n').slice(1) ?? [];
  for (const line of stack) {
    if (
      line.includes('/stories/authoring/') ||
      line.includes('/stories/runtime/') ||
      line.includes('node:internal')
    ) {
      continue;
    }
    const match = line.match(
      /(?:\(|\s)(file:\/\/\/[^)\s]+|\/[^)\s]+):(\d+):(\d+)\)?$/,
    );
    if (match?.[1] !== undefined) {
      return {
        file: decodeURIComponent(match[1].replace(/^file:\/\//, '')),
        line: Number(match[2]),
        column: Number(match[3]),
      };
    }
  }
  return { file: '<unknown>', line: 0, column: 0 };
}
