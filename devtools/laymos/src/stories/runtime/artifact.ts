import { readFileSync, realpathSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { Lang, parse } from '@ast-grep/napi';

import type {
  ExecutionItem,
  ExecutionPath,
  StoryArm,
  StoryBlock,
  StoryBlockVisitOutcome,
  StoryTerminalCompletion,
} from './artifact-types.js';
import type {
  ArmDeclaration,
  BlockDeclaration,
  SelectedArm,
  SourceLocation,
  StoryRecorder,
} from './recorder.js';
import type { Attributes } from './types.js';

interface MutableVisit {
  readonly blockId: string;
  outcome: StoryBlockVisitOutcome;
  readonly startOffsetMillis: number;
  durationMillis: number;
  readonly selectedArm?: SelectedArm;
  readonly attributes?: Readonly<Record<string, unknown>>;
  terminalMismatch?: boolean;
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
  readonly block: BlockDeclaration;
  readonly arm: ArmDeclaration | undefined;
  readonly visit: MutableVisit;
  readonly container: Container;
  readonly children: Container;
  readonly parent: VisitToken | undefined;
  readonly branch: unknown;
}

const closedVisitToken = Symbol('closed-story-visit');

interface RegisteredBlock {
  readonly block: StoryBlock;
  readonly arms: Map<string, StoryArm>;
}

export class StoryBlockRegistry {
  private readonly blocks = new Map<string, RegisteredBlock>();

  constructor(
    private readonly baseDir: string,
    private readonly modulePaths: readonly string[] = [],
  ) {}

  declare(block: BlockDeclaration): string {
    const location = normalizeLocation(this.baseDir, block);
    const id = `${location.file}:${location.line}:${location.column}`;
    const existing = this.blocks.get(id);
    if (existing !== undefined) {
      if (
        existing.block.name !== block.name ||
        existing.block.kind !== block.kind ||
        existing.block.description !== block.description ||
        !sameCompletion(existing.block, block)
      ) {
        throw new Error(`Conflicting Story Block declarations at ${id}`);
      }
      return id;
    }
    const common = {
      name: block.name,
      description: block.description,
      location,
      visibility: block.visibility,
      ...moduleOwnership(location.file, this.modulePaths),
    };
    const storyBlock: StoryBlock =
      block.kind === 'decision'
        ? { ...common, kind: 'decision', arms: [] }
        : block.kind === 'terminal'
          ? {
              ...common,
              kind: 'terminal',
              completion: requireTerminalCompletion(block),
            }
          : { ...common, kind: block.kind };
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
    registered.arms.set(key, {
      ...arm,
      location: normalizeLocation(this.baseDir, arm),
    });
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

function moduleOwnership(
  file: string,
  modulePaths: readonly string[],
): { readonly modulePath?: string } {
  const modulePath = modulePaths
    .filter(
      (path) => path === '.' || file === path || file.startsWith(`${path}/`),
    )
    .sort((left, right) => right.length - left.length)[0];
  return modulePath === undefined ? {} : { modulePath };
}

function requireTerminalCompletion(
  block: BlockDeclaration,
): StoryTerminalCompletion {
  if (block.completion === undefined) {
    throw new Error(`Terminal "${block.name}" must declare completion`);
  }
  return block.completion;
}

export class ScenarioRecorder implements StoryRecorder {
  private readonly root: Container = makeContainer([]);
  private readonly anchor = performance.now();
  private closed = false;
  private active = false;
  private readonly closedBranches = new Map<
    VisitToken | typeof rootStoryScope,
    Map<unknown, VisitToken[]>
  >();
  private readonly mismatches: string[] = [];

  constructor(private readonly blocks: StoryBlockRegistry) {}

  declareArm(block: BlockDeclaration, arm: ArmDeclaration): void {
    if (this.closed || !this.active) return;
    this.blocks.declareArm(block, arm);
  }

  start(
    block: BlockDeclaration,
    selectedArm: SelectedArm | undefined,
    selectedArmDeclaration: ArmDeclaration | undefined,
    attributes: Attributes | undefined,
    parent: unknown,
    branch: unknown,
  ): VisitToken {
    if (this.closed || !this.active)
      return closedVisitToken as unknown as VisitToken;
    const parentToken = isVisitToken(parent) ? parent : undefined;
    const container = parentToken?.children ?? this.root;
    const scope = nearestFlow(parentToken) ?? rootStoryScope;
    const closed = this.closedBranches.get(scope)?.get(branch) ?? [];
    for (const terminal of closed) {
      terminal.visit.terminalMismatch = true;
      const subject =
        terminal.arm === undefined
          ? `Terminal "${terminal.block.name}"`
          : `Arm "${terminal.arm.name}" on Decision "${terminal.block.name}"`;
      this.mismatches.push(
        `${subject} was followed by Block "${block.name}" in the same sequential branch`,
      );
    }
    this.closedBranches.get(scope)?.delete(branch);
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
      block,
      arm: selectedArmDeclaration,
      visit,
      container,
      children: makeContainer(visit.children),
      parent: parentToken,
      branch,
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
    if (
      token.block.kind === 'terminal' ||
      token.arm?.completion !== undefined
    ) {
      this.validateCompletion(token, outcome);
      const scope = nearestFlow(token.parent) ?? rootStoryScope;
      const branches = this.closedBranches.get(scope) ?? new Map();
      const terminals = branches.get(token.branch) ?? [];
      terminals.push(token);
      branches.set(token.branch, terminals);
      this.closedBranches.set(scope, branches);
    }
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

  terminalMismatches(): readonly string[] {
    return this.mismatches;
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

  private validateCompletion(
    token: VisitToken,
    outcome: StoryBlockVisitOutcome,
  ): void {
    const completion =
      token.arm?.completion ??
      (token.block.kind === 'terminal' ? token.block.completion : undefined);
    if (completion === undefined) return;
    const matches =
      completion.kind === 'success'
        ? outcome === 'succeeded'
        : outcome === 'failed';
    if (matches) return;
    token.visit.terminalMismatch = true;
    const subject =
      token.arm === undefined
        ? `Terminal "${token.block.name}"`
        : `Arm "${token.arm.name}" on Decision "${token.block.name}"`;
    this.mismatches.push(
      `${subject} declares ${completion.kind} completion but its Visit was ${outcome}`,
    );
  }
}

export type {
  ExecutionItem,
  ExecutionPath,
  StoryRun,
} from './artifact-types.js';

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
      ...(item.terminalMismatch === undefined
        ? {}
        : { terminalMismatch: item.terminalMismatch }),
      children: normalizePath(item.children),
    });
  }
  return normalized;
}

function normalizeLocation(
  baseDir: string,
  source: { readonly location: SourceLocation },
): {
  readonly file: string;
  readonly line: number;
  readonly endLine: number;
  readonly column: number;
} {
  const root = realpathSync(baseDir);
  const isAbsolute = source.location.file.startsWith('/');
  const absoluteFile = isAbsolute
    ? realpathSync(source.location.file)
    : resolve(root, source.location.file);
  const file = isAbsolute ? relative(root, absoluteFile) : source.location.file;
  return {
    file: file.split(sep).join('/'),
    line: source.location.line,
    endLine: sourceEndLine(
      absoluteFile,
      source.location.line,
      source.location.column,
    ),
    column: source.location.column,
  };
}

const sourceCallRanges = new Map<
  string,
  readonly {
    readonly startLine: number;
    readonly startColumn: number;
    readonly endLine: number;
    readonly endColumn: number;
    readonly size: number;
  }[]
>();

function sourceEndLine(file: string, line: number, column: number): number {
  try {
    let ranges = sourceCallRanges.get(file);
    if (ranges === undefined) {
      const source = readFileSync(file, 'utf8');
      const language = /\.(?:tsx|jsx)$/.test(file) ? Lang.Tsx : Lang.TypeScript;
      ranges = parse(language, source)
        .root()
        .findAll({ rule: { kind: 'call_expression' as never } })
        .map((node) => {
          const range = node.range();
          return {
            startLine: range.start.line + 1,
            startColumn: range.start.column + 1,
            endLine: range.end.line + 1,
            endColumn: range.end.column + 1,
            size: range.end.index - range.start.index,
          };
        });
      sourceCallRanges.set(file, ranges);
    }
    return (
      ranges
        .filter(
          (range) =>
            range.startLine < line ||
            (range.startLine === line && range.startColumn <= column),
        )
        .filter(
          (range) =>
            range.endLine > line ||
            (range.endLine === line && range.endColumn >= column),
        )
        .sort((left, right) => left.size - right.size)[0]?.endLine ?? line
    );
  } catch {
    return line;
  }
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
    JSON.stringify(left.errors) === JSON.stringify(right.errors) &&
    JSON.stringify(left.completion) === JSON.stringify(right.completion) &&
    (left.kind === 'otherwise' ||
      (right.kind === 'literal' && left.value === right.value))
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

const rootStoryScope = Symbol('root-story-scope');

function nearestFlow(token: VisitToken | undefined): VisitToken | undefined {
  let current = token;
  while (current !== undefined) {
    if (current.block.kind === 'flow') return current;
    current = current.parent;
  }
  return undefined;
}

function sameCompletion(left: StoryBlock, right: BlockDeclaration): boolean {
  const leftCompletion = left.kind === 'terminal' ? left.completion : undefined;
  const rightCompletion =
    right.kind === 'terminal' ? right.completion : undefined;
  return (
    leftCompletion?.kind === rightCompletion?.kind &&
    (leftCompletion?.kind !== 'error' ||
      (rightCompletion?.kind === 'error' &&
        leftCompletion.error === rightCompletion.error))
  );
}
