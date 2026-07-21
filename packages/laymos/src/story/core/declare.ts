import { captureLocation } from './recorder.js';
import type { SourceLocation } from './recorder.js';
import type { StoryMeta } from './types.js';

export type ScenarioExpectation =
  | {
      readonly kind: 'success';
      readonly verify: (value: unknown, prepared: unknown) => unknown;
    }
  | {
      readonly kind: 'error';
      readonly verify: (error: unknown, prepared: unknown) => unknown;
    };

interface ScenarioDeclarationBase {
  readonly name: string;
  readonly description: string;
  readonly mode: 'run' | 'skip';
  readonly location: SourceLocation;
}

export type ScenarioDeclaration =
  | (ScenarioDeclarationBase & { readonly mode: 'skip' })
  | (ScenarioDeclarationBase & {
      readonly mode: 'run';
      readonly run: {
        readonly prepare: () => unknown;
        readonly expectation: ScenarioExpectation;
        readonly cleanup?: (prepared: unknown) => unknown;
        readonly timeout?: unknown;
      };
    });

export interface StoryExecution {
  readonly execute: (prepared: unknown) => unknown;
  readonly layer?: unknown;
}

export interface StoryDeclaration {
  readonly name: string;
  readonly description: string;
  readonly scenarios: readonly ScenarioDeclaration[];
  readonly execution: StoryExecution | undefined;
}

export interface MutableStoryDeclaration {
  readonly name: string;
  readonly description: string;
  readonly scenarios: ScenarioDeclaration[];
  execution: StoryExecution | undefined;
}

export type StoryCollector = (declaration: StoryDeclaration) => void;

const collectorKey = Symbol.for('laymos/story-collector');

type CollectorHost = typeof globalThis & {
  [collectorKey]?: StoryCollector;
};

const collectorHost = globalThis as CollectorHost;

/** Declares the single Story owned by a Story file. */
export function declareStory(
  name: string,
  meta: StoryMeta,
): MutableStoryDeclaration {
  requireDescription(meta.description, `Story "${name}"`);
  const declaration: MutableStoryDeclaration = {
    name,
    description: meta.description,
    scenarios: [],
    execution: undefined,
  };
  collectorHost[collectorKey]?.(declaration);
  return declaration;
}

/** Adds a Scenario to a mutable Story declaration. */
export function addScenario(
  declaration: MutableStoryDeclaration,
  scenario:
    | Omit<Extract<ScenarioDeclaration, { readonly mode: 'skip' }>, 'location'>
    | Omit<Extract<ScenarioDeclaration, { readonly mode: 'run' }>, 'location'>,
): void {
  requireDescription(scenario.description, `Scenario "${scenario.name}"`);
  declaration.scenarios.push({
    ...scenario,
    location: captureLocation(),
  } as ScenarioDeclaration);
}

function requireDescription(description: string, subject: string): void {
  if (description.trim().length === 0) {
    throw new TypeError(`${subject} description must not be empty`);
  }
}

/** Runs `load` with a Story collector installed and returns what it declared. */
export async function collectDeclaredStories(
  load: () => Promise<unknown>,
): Promise<StoryDeclaration[]> {
  if (collectorHost[collectorKey] !== undefined) {
    throw new Error('Story modules must be loaded sequentially');
  }
  const collected: StoryDeclaration[] = [];
  collectorHost[collectorKey] = (declaration) => collected.push(declaration);
  try {
    await load();
    return collected;
  } finally {
    delete collectorHost[collectorKey];
  }
}
