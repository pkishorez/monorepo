import { realpathSync } from 'node:fs';
import { relative, sep } from 'node:path';

import type {
  ExecutionItem,
  ExecutionPath,
  StoryArm,
  StoryBlock,
  StoryBlockVisitOutcome,
} from './types.js';
import type {
  ArmDeclaration,
  BlockDeclaration,
  SelectedArm,
  StoryRecorder,
} from '../core/recorder.js';
import type { Attributes } from '../core/types.js';

interface MutableVisit {
  readonly blockId: string;
  outcome: StoryBlockVisitOutcome;
  readonly startOffsetMillis: number;
  durationMillis: number;
  readonly selectedArm?: SelectedArm;
  readonly attributes?: Readonly<Record<string, unknown>>;
  readonly children: MutableExecutionItem[];
}

type MutableExecutionItem =
  | MutableVisit
  | { readonly parallel: MutableExecutionItem[][] };

interface Container {
  readonly items: MutableExecutionItem[];
  readonly active: Set<VisitToken>;
  parallel: { readonly parallel: MutableExecutionItem[][] } | undefined;
}

interface VisitToken {
  readonly visit: MutableVisit;
  readonly container: Container;
  readonly children: Container;
}

const closedVisitToken = Symbol('closed-story-visit');

interface RegisteredBlock {
  readonly block: StoryBlock;
  readonly arms: Map<string, StoryArm>;
}

export class StoryBlockRegistry {
  private readonly blocks = new Map<string, RegisteredBlock>();

  constructor(private readonly baseDir: string) {}

  declare(block: BlockDeclaration): string {
    const location = normalizeLocation(this.baseDir, block);
    const id = `${location.file}:${location.line}:${location.column}`;
    const existing = this.blocks.get(id);
    if (existing !== undefined) {
      if (
        existing.block.name !== block.name ||
        existing.block.kind !== block.kind ||
        existing.block.description !== block.description
      ) {
        throw new Error(`Conflicting Story Block declarations at ${id}`);
      }
      return id;
    }
    const common = {
      name: block.name,
      description: block.description,
      location,
    };
    const storyBlock: StoryBlock =
      block.kind === 'decision'
        ? { ...common, kind: 'decision', arms: [] }
        : { ...common, kind: 'block' };
    this.blocks.set(id, { block: storyBlock, arms: new Map() });
    return id;
  }

  declareArm(block: BlockDeclaration, arm: ArmDeclaration): void {
    const id = this.declare(block);
    const registered = this.blocks.get(id);
    if (registered?.block.kind !== 'decision') {
      throw new Error(`Block "${block.name}" cannot declare Decision Arms`);
    }
    const key = armKey(arm);
    const existing = registered.arms.get(key);
    if (existing !== undefined && !sameArm(existing, arm)) {
      throw new Error(
        `Conflicting metadata for Arm "${arm.name}" on Decision "${block.name}"`,
      );
    }
    registered.arms.set(key, arm);
  }

  toRecord(): Readonly<Record<string, StoryBlock>> {
    return Object.fromEntries(
      [...this.blocks.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([id, registered]) => [
          id,
          registered.block.kind === 'decision'
            ? {
                ...registered.block,
                arms: [...registered.arms.values()].sort((left, right) =>
                  armKey(left).localeCompare(armKey(right)),
                ),
              }
            : registered.block,
        ]),
    );
  }
}

export class ScenarioRecorder implements StoryRecorder {
  private readonly root: Container = makeContainer([]);
  private readonly anchor = performance.now();
  private closed = false;
  private active = false;

  constructor(private readonly blocks: StoryBlockRegistry) {}

  declareArm(block: BlockDeclaration, arm: ArmDeclaration): void {
    if (this.closed || !this.active) return;
    this.blocks.declareArm(block, arm);
  }

  start(
    block: BlockDeclaration,
    selectedArm: SelectedArm | undefined,
    attributes: Attributes | undefined,
    parent: unknown,
  ): VisitToken {
    if (this.closed || !this.active)
      return closedVisitToken as unknown as VisitToken;
    const parentToken = isVisitToken(parent) ? parent : undefined;
    const container = parentToken?.children ?? this.root;
    const visit: MutableVisit = {
      blockId: this.blocks.declare(block),
      outcome: 'succeeded',
      startOffsetMillis: this.offset(),
      durationMillis: 0,
      ...(selectedArm === undefined ? {} : { selectedArm }),
      ...(attributes === undefined
        ? {}
        : { attributes: serializeAttributes(block, attributes) }),
      children: [],
    };
    const token: VisitToken = {
      visit,
      container,
      children: makeContainer(visit.children),
    };
    appendVisit(container, token);
    return token;
  }

  finish(token: unknown, outcome: StoryBlockVisitOutcome): void {
    if (this.closed || token === closedVisitToken) return;
    if (!isVisitToken(token))
      throw new Error('Invalid Story Block Visit token');
    token.visit.outcome = outcome;
    token.visit.durationMillis = roundMillis(
      this.offset() - token.visit.startOffsetMillis,
    );
    token.container.active.delete(token);
    if (token.container.active.size === 0) token.container.parallel = undefined;
  }

  close(): void {
    for (const token of this.root.active) this.interrupt(token);
    this.closed = true;
  }

  /** Activates recording for the shared Story execution phase. */
  activate(): void {
    if (!this.closed) this.active = true;
  }

  /** Deactivates recording outside the shared Story execution phase. */
  deactivate(): void {
    this.active = false;
  }

  execution(): ExecutionPath {
    return normalizePath(this.root.items);
  }

  private interrupt(token: VisitToken): void {
    token.visit.outcome = 'interrupted';
    token.visit.durationMillis = roundMillis(
      this.offset() - token.visit.startOffsetMillis,
    );
    for (const child of token.children.active) this.interrupt(child);
  }

  private offset(): number {
    return roundMillis(performance.now() - this.anchor);
  }
}

export type { ExecutionItem, ExecutionPath, StoryArtifact } from './types.js';

export function roundMillis(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function makeContainer(items: MutableExecutionItem[]): Container {
  return { items, active: new Set(), parallel: undefined };
}

function appendVisit(container: Container, token: VisitToken): void {
  if (container.active.size === 0) {
    container.items.push(token.visit);
  } else if (container.parallel === undefined) {
    const prior = [...container.active][0];
    if (prior === undefined)
      throw new Error('Invalid active Story Visit state');
    const priorIndex = container.items.lastIndexOf(prior.visit);
    if (priorIndex < 0) {
      throw new Error('Ambiguous concurrent Story Block structure');
    }
    const parallel = { parallel: [[prior.visit], [token.visit]] };
    container.items.splice(priorIndex, 1, parallel);
    container.parallel = parallel;
  } else {
    container.parallel.parallel.push([token.visit]);
  }
  container.active.add(token);
}

function normalizePath(items: readonly MutableExecutionItem[]): ExecutionPath {
  const normalized: ExecutionItem[] = [];
  for (const item of items) {
    if ('parallel' in item) {
      const branches = item.parallel
        .map(normalizePath)
        .filter((branch) => branch.length > 0)
        .sort((left, right) =>
          JSON.stringify(left).localeCompare(JSON.stringify(right)),
        );
      if (branches.length === 1) normalized.push(...branches[0]!);
      else if (branches.length > 1) normalized.push({ parallel: branches });
      continue;
    }
    normalized.push({
      blockId: item.blockId,
      outcome: item.outcome,
      startOffsetMillis: item.startOffsetMillis,
      durationMillis: item.durationMillis,
      ...(item.selectedArm === undefined
        ? {}
        : { selectedArm: item.selectedArm }),
      ...(item.attributes === undefined ? {} : { attributes: item.attributes }),
      children: normalizePath(item.children),
    });
  }
  return normalized;
}

function normalizeLocation(
  baseDir: string,
  block: BlockDeclaration,
): { readonly file: string; readonly line: number; readonly column: number } {
  const file = block.location.file.startsWith('/')
    ? relative(realpathSync(baseDir), realpathSync(block.location.file))
    : block.location.file;
  return {
    file: file.split(sep).join('/'),
    line: block.location.line,
    column: block.location.column,
  };
}

function armKey(arm: ArmDeclaration | StoryArm): string {
  return arm.kind === 'otherwise'
    ? 'otherwise'
    : `literal:${typeof arm.value}:${JSON.stringify(arm.value)}`;
}

function sameArm(left: StoryArm, right: ArmDeclaration): boolean {
  return (
    left.kind === right.kind &&
    left.name === right.name &&
    left.description === right.description &&
    (left.kind === 'otherwise' ||
      (right.kind === 'literal' && Object.is(left.value, right.value)))
  );
}

function serializeAttributes(
  block: BlockDeclaration,
  attributes: Attributes,
): Readonly<Record<string, unknown>> {
  try {
    const json = JSON.stringify(attributes);
    if (json === undefined)
      throw new TypeError('value serialized to undefined');
    const value: unknown = JSON.parse(json);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new TypeError('value did not serialize to an object');
    }
    return value as Readonly<Record<string, unknown>>;
  } catch (cause) {
    throw new Error(
      `Attributes for Story Block "${block.name}" at ${block.location.file}:${block.location.line}:${block.location.column} are not JSON-serializable`,
      { cause },
    );
  }
}

function isVisitToken(value: unknown): value is VisitToken {
  return (
    typeof value === 'object' &&
    value !== null &&
    'visit' in value &&
    'container' in value &&
    'children' in value
  );
}
