import { Suspense, lazy, useMemo } from 'react';
import type { CSSProperties, ComponentType, ReactNode } from 'react';
import { Cause, Effect, Layer } from 'effect';
import type { FakeWorld } from '@kestack/kabuki/fake';
import { View } from '@kestack/kabuki/react';
import type { AppRuntime, Attachment } from '@kestack/kabuki/react/types';
import {
  DevtoolsDialog,
  DevtoolsDock,
} from '@kestack/web-platform/recipes/devtools';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { tab } from './server/index.ts';
import type { TabOptions } from './server/index.ts';
import type { Place, Shown } from './actor-inspector/index.ts';
import { inPage } from './services/kabuki-session/real/index.ts';

type WorldGiven = FakeWorld | (() => Promise<FakeWorld>);

const worldOf = (
  world: WorldGiven | undefined,
): Effect.Effect<FakeWorld | undefined> =>
  typeof world === 'function'
    ? Effect.tryPromise(() => world()).pipe(
        Effect.tapError((error) =>
          Effect.sync(() =>
            console.error(
              '[@kestack/devtools-kabuki] could not load the FakeWorld; going on without one',
              error.cause,
            ),
          ),
        ),
        Effect.orElseSucceed(() => undefined),
      )
    : Effect.succeed(world);

export interface ConnectOptions extends TabOptions {
  readonly world?: WorldGiven;
}

const stopped = () => {};

export const connect =
  (options: ConnectOptions = {}): Attachment =>
  (app) => {
    if (typeof globalThis.WebSocket !== 'function') return stopped;
    try {
      const fiber = Effect.runFork(
        Layer.launch(
          tab(app, options).pipe(
            Layer.provide(
              Layer.unwrap(
                Effect.map(worldOf(options.world), (world) =>
                  inPage(app, world),
                ),
              ),
            ),
          ),
        ).pipe(
          Effect.catchCause((cause) =>
            Effect.sync(() => {
              if (!Cause.hasInterruptsOnly(cause))
                console.error(
                  `[@kestack/devtools-kabuki] ${app.name} stopped answering DevTools:\n${Cause.pretty(cause)}`,
                );
            }),
          ),
        ),
      );
      return () => fiber.interruptUnsafe();
    } catch (error) {
      console.error(
        '[@kestack/devtools-kabuki] could not connect to DevTools',
        error,
      );
      return stopped;
    }
  };

const BLUR = 10;

const panels = new WeakMap<AppRuntime, ComponentType>();

const panelOf = (
  runtime: AppRuntime,
  world: WorldGiven | undefined,
  shown: Shown,
): ComponentType => {
  const kept = panels.get(runtime);
  if (kept) return kept;
  const made = lazy(async () => {
    const [{ InspectorView }, given] = await Promise.all([
      import('./actor-inspector/index.ts'),
      Effect.runPromise(worldOf(world)),
    ]);
    return {
      default: View.app(InspectorView, {
        layer: inPage(runtime, given),
        name: `@kestack/devtools-kabuki/inspector:${runtime.name}`,
        window: 0,
        input: () => shown,
      }),
    };
  });
  panels.set(runtime, made);
  return made;
};

export interface KabukiInspectorProps {
  readonly runtime: AppRuntime;
  readonly world?: WorldGiven;
  readonly presenting?: boolean;
  readonly timelineAt?: Place;
  readonly overlay?: boolean;
  readonly dotted?: boolean;
  readonly className?: string;
}

export function KabukiInspector({
  runtime,
  world,
  presenting = false,
  timelineAt = 'bottom',
  overlay = false,
  dotted = true,
  className,
}: KabukiInspectorProps) {
  const Panel = useMemo(
    () => panelOf(runtime, world, { presenting, place: timelineAt }),
    [runtime],
  );
  return (
    <div
      className={cn(
        '@container relative flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground',
        overlay && 'bg-background/60',
        className,
      )}
      style={{
        ...(overlay ? { backdropFilter: `blur(${BLUR}px) saturate(1.5)` } : {}),
        ...(dotted && !overlay
          ? {}
          : ({ '--inspector-dots': 'none' } as CSSProperties)),
      }}
    >
      <Suspense fallback={null}>
        <Panel />
      </Suspense>
    </div>
  );
}

export interface KabukiDevtoolsProps {
  readonly runtime: AppRuntime | null;
  readonly world?: WorldGiven;
  readonly storageKey: string;
  readonly onPhones?: boolean;
  readonly form?: 'dock' | 'dialog';
  readonly children: ReactNode;
}

export function KabukiDevtools({
  runtime,
  world,
  storageKey,
  onPhones = true,
  form = 'dock',
  children,
}: KabukiDevtoolsProps) {
  if (form === 'dialog')
    return (
      <>
        {children}
        <DevtoolsDialog
          storageKey={storageKey}
          onPhones={onPhones}
          devtools={
            runtime && (
              <KabukiInspector
                runtime={runtime}
                {...(world ? { world } : {})}
                overlay
              />
            )
          }
        />
      </>
    );
  return (
    <DevtoolsDock
      storageKey={storageKey}
      onPhones={onPhones}
      devtools={(layout) =>
        runtime && (
          <KabukiInspector
            runtime={runtime}
            {...(world ? { world } : {})}
            overlay={layout === 'full'}
          />
        )
      }
    >
      {children}
    </DevtoolsDock>
  );
}
