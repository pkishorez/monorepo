import { Context, Effect } from 'effect';

import { StoryBlockRegistry } from './artifact.js';
import type {
  StoryArm,
  StoryTraceItem,
  StoryTraceOptions,
  StoryTracePath,
} from './types.js';
import type {
  ArmDeclaration,
  BlockDeclaration,
  SourceLocation,
} from '../core/recorder.js';

type MutableTracePath = StoryTraceItem[];

export interface TraceContext {
  readonly recorder: TraceRecorder;
  readonly path: MutableTracePath;
}

export const CurrentTrace = Context.Reference<TraceContext | undefined>(
  'laymos/story/current-trace',
  { defaultValue: () => undefined },
);

const traceValueTarget = () => undefined;

export const traceValue: unknown = new Proxy(traceValueTarget, {
  apply: () => traceValue,
  construct: () => traceValue as object,
  get: (_target, property) => {
    if (property === 'then') return undefined;
    if (property === 'length') return 0;
    if (property === Symbol.toPrimitive) return () => 0;
    if (property === Symbol.iterator) return () => [][Symbol.iterator]();
    return traceValue;
  },
});

export class TraceRecorder {
  readonly root: MutableTracePath = [];
  private readonly activeFlows = new Set<string>();
  private readonly recursiveFlows = new Set<string>();

  constructor(readonly blocks: StoryBlockRegistry) {}

  declare(block: BlockDeclaration): string {
    return this.blocks.declare(block);
  }

  flow(
    context: TraceContext,
    block: BlockDeclaration,
    effect: Effect.Effect<unknown, unknown, unknown>,
  ): Effect.Effect<unknown, unknown, unknown> {
    const blockId = this.declare(block);
    if (this.activeFlows.has(blockId)) {
      this.recursiveFlows.add(blockId);
      context.path.push({ kind: 'flow-reference', blockId });
      return Effect.succeed(traceValue);
    }
    const children: MutableTracePath = [];
    context.path.push({ kind: 'flow', blockId, children });
    return Effect.acquireUseRelease(
      Effect.sync(() => this.activeFlows.add(blockId)),
      () =>
        effect.pipe(
          Effect.provideService(CurrentTrace, {
            recorder: this,
            path: children,
          }),
          Effect.as(traceValue),
        ),
      () => Effect.sync(() => this.activeFlows.delete(blockId)),
    );
  }

  step(context: TraceContext, block: BlockDeclaration): unknown {
    const blockId = this.declare(block);
    context.path.push({ kind: 'step', blockId });
    return traceValue;
  }

  terminal(context: TraceContext, block: BlockDeclaration): unknown {
    const blockId = this.declare(block);
    context.path.push({ kind: 'terminal', blockId });
    return traceValue;
  }

  omission(
    context: TraceContext,
    location: SourceLocation,
    reason: string,
  ): unknown {
    context.path.push({
      kind: 'omission',
      location,
      reason,
    });
    return traceValue;
  }

  decision(
    context: TraceContext,
    block: BlockDeclaration,
    arms: readonly {
      readonly declaration: ArmDeclaration;
      readonly body: () => Effect.Effect<unknown, unknown, unknown>;
    }[],
  ): Effect.Effect<unknown, unknown, unknown> {
    const blockId = this.declare(block);
    for (const arm of arms) this.blocks.declareArm(block, arm.declaration);
    const tracedArms: Array<{ arm: StoryArm; children: MutableTracePath }> = [];
    context.path.push({
      kind: 'decision',
      blockId,
      arms: tracedArms,
    });
    return Effect.gen({ self: this }, function* () {
      for (const arm of arms) {
        const children: MutableTracePath = [];
        tracedArms.push({ arm: arm.declaration, children });
        yield* arm.body().pipe(
          Effect.catch(() => Effect.void),
          Effect.provideService(CurrentTrace, {
            recorder: this,
            path: children,
          }),
        );
      }
      return traceValue;
    });
  }

  all(
    context: TraceContext,
    effects: readonly Effect.Effect<unknown, unknown, unknown>[],
    options: StoryTraceOptions,
  ): Effect.Effect<unknown, unknown, unknown> {
    const branches = effects.map(() => [] as MutableTracePath);
    context.path.push({ kind: 'all', options, branches });
    return Effect.forEach(effects, (effect, index) =>
      effect.pipe(
        Effect.provideService(CurrentTrace, {
          recorder: this,
          path: branches[index]!,
        }),
      ),
    ).pipe(Effect.as(traceValue));
  }

  forEach(
    context: TraceContext,
    body: Effect.Effect<unknown, unknown, unknown>,
    options: StoryTraceOptions,
  ): Effect.Effect<unknown, unknown, unknown> {
    const path: MutableTracePath = [];
    context.path.push({ kind: 'for-each', options, body: path });
    return body.pipe(
      Effect.provideService(CurrentTrace, { recorder: this, path }),
      Effect.as(traceValue),
    );
  }

  finish(): {
    readonly execution: StoryTracePath;
    readonly definitions: Readonly<Record<string, StoryTracePath>>;
  } {
    const counts = new Map<string, number>();
    visit(this.root, (item) => {
      if (item.kind === 'flow') {
        counts.set(item.blockId, (counts.get(item.blockId) ?? 0) + 1);
      }
    });
    const shared = new Set(
      [...counts]
        .filter(([id, count]) => count > 1 || this.recursiveFlows.has(id))
        .map(([id]) => id),
    );
    const definitions: Record<string, StoryTracePath> = {};
    const normalize = (path: StoryTracePath): StoryTracePath =>
      path.map((item): StoryTraceItem => {
        if (item.kind === 'flow') {
          const children = normalize(item.children);
          if (shared.has(item.blockId) && children.length > 0) {
            definitions[item.blockId] ??= children;
            return { kind: 'flow-reference', blockId: item.blockId };
          }
          return { ...item, children };
        }
        if (item.kind === 'decision') {
          return {
            ...item,
            arms: item.arms.map((arm) => ({
              ...arm,
              children: normalize(arm.children),
            })),
          };
        }
        if (item.kind === 'all') {
          return { ...item, branches: item.branches.map(normalize) };
        }
        if (item.kind === 'for-each') {
          return { ...item, body: normalize(item.body) };
        }
        return item;
      });
    return { execution: normalize(this.root), definitions };
  }
}

function visit(
  path: StoryTracePath,
  body: (item: StoryTraceItem) => void,
): void {
  for (const item of path) {
    body(item);
    if (item.kind === 'flow') visit(item.children, body);
    else if (item.kind === 'decision') {
      for (const arm of item.arms) visit(arm.children, body);
    } else if (item.kind === 'all') {
      for (const branch of item.branches) visit(branch, body);
    } else if (item.kind === 'for-each') visit(item.body, body);
  }
}
