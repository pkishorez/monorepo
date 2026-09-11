import { Cause, Effect, Layer, Logger } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';
import { Stack } from 'alchemy/Stack';
import { Stage } from 'alchemy/Stage';
import { State } from 'alchemy/State';
import { makeHttpStateStore } from 'alchemy/State/HttpStateStore';
import { PlatformServices } from 'alchemy/Util/PlatformServices';
import { AlchemyContext } from 'alchemy/AlchemyContext';
import { ArtifactStore, createArtifactStore } from 'alchemy/Artifacts';
import { Cli } from 'alchemy/Cli/Cli';
import { apply } from 'alchemy/Apply';
import { RandomProvider } from 'alchemy/Random';
import { KeyPairProvider } from 'alchemy/KeyPair';
import type { ResourceState } from 'alchemy/State';
import type {
  analysisEvent,
  credentialChoice,
  deletionEvent,
  deletionPlan,
} from '../../../../shared/contracts/deletion/index.ts';
import {
  layer as providerLayer,
  supportsDeletion,
  type Credential,
} from '../../../providers/providers/index.ts';
import {
  PrepareError,
  isForgotten,
  prepare,
  resourceRows,
  snapshot,
  stageChanged,
} from '../review/index.ts';
import { select, toView, type Selection } from '../selection/index.ts';
import * as forget from '../forget/index.ts';

export type EngineEvent = typeof deletionEvent.Type | typeof analysisEvent.Type;
export type EngineInput = {
  stack: string;
  stage: string;
  fingerprint?: string;
  state: { url: string; authToken: string };
  stateCredentialId: string;
  available: readonly Credential[];
  credentials?: readonly (typeof credentialChoice.Type)[] | null;
  forget?: readonly { id: string; type: string }[] | null;
};

const previousGenerations = (
  state: ResourceState,
): { type: string; action: 'delete' | 'retain' }[] =>
  state.status === 'replacing' || state.status === 'replaced'
    ? [
        {
          type: state.old.resourceType,
          action: state.removalPolicy === 'retain' ? 'retain' : 'delete',
        },
        ...previousGenerations(state.old),
      ]
    : [];

const safeFailure = (
  cause: Cause.Cause<unknown>,
  redact: (text: string) => string,
): { error: string; resource: string | null } => {
  const error = Cause.squash(cause);
  if (error instanceof PrepareError)
    return {
      error: redact(error.message),
      resource: error.resource === null ? null : redact(error.resource),
    };
  return {
    error:
      'Alchemy could not complete this operation. Check the selected credentials and resource permissions, then refresh the stage and review a new plan before retrying. Remaining state has been preserved.',
    resource: null,
  };
};

// One Alchemy layer per selected credential, plus forget handling: forget-only
// providers for unsupported types, and shadows over real providers so that a
// forgotten row of a supported type skips its cloud call. Shadows are built
// over the credential layers, so unforgotten rows still delete for real.
const providerLayers = (
  selections: readonly Selection[],
  forgotten: EngineInput['forget'],
) => {
  const entries = forgotten ?? [];
  const real = selections
    .filter((selection) => selection.selected !== null)
    .reduce<Layer.Layer<never, never, never>>(
      (layer, selection) =>
        Layer.merge(
          layer,
          providerLayer(
            selection.selected!,
            selection.region,
          ) as Layer.Layer<never>,
        ),
      Layer.mergeAll(
        RandomProvider(),
        KeyPairProvider(),
        forget.providers(
          entries
            .map((entry) => entry.type)
            .filter((type) => !supportsDeletion(type)),
        ),
      ) as Layer.Layer<never>,
    );
  const shadows = forget.shadows(
    entries.filter((entry) => supportsDeletion(entry.type)),
  );
  return Layer.merge(real, Layer.provide(shadows, real));
};

export const execute = (
  input: EngineInput,
  mode: 'preview' | 'delete',
  emit: (event: EngineEvent) => void,
) => {
  const redact = (text: string) =>
    [
      input.state.authToken,
      ...input.available.flatMap((credential) =>
        Object.values(credential.secret),
      ),
    ]
      .filter((secret): secret is string => !!secret && secret.length >= 8)
      .reduce((s, secret) => s.replaceAll(secret, 'xxxxxxxx'), text);
  return Effect.gen(function* () {
    const state = yield* makeHttpStateStore({ ...input.state, id: 'http' });
    const target = { stack: input.stack, stage: input.stage };
    const before = yield* snapshot(state, target);
    const selections = select(resourceRows(before), {
      available: input.available,
      stateCredentialId: input.stateCredentialId,
      choices: input.credentials,
    });
    const cli = {
      approvePlan: () => Effect.succeed(false),
      displayPlan: () => Effect.void,
      startApplySession: (plan: import('alchemy/Plan').Plan) =>
        Effect.succeed({
          emit: (event: import('alchemy/Cli/Event').ApplyEvent) =>
            Effect.sync(() => {
              if (event.kind !== 'status-change') return;
              // Never send provider annotations/errors: they can contain credentials and props.
              const matching = [
                ...Object.values(plan.deletions)
                  .filter((node) => node !== undefined)
                  .filter(
                    (node) =>
                      node.resource.LogicalId === event.id &&
                      node.resource.Type === event.type,
                  )
                  .map((node) => node.resource.FQN),
                ...Object.entries(plan.actionDeletions)
                  .filter(
                    ([, node]) =>
                      node?.def.LogicalId === event.id &&
                      node.def.Type === event.type,
                  )
                  .map(([fqn]) => fqn),
              ];
              emit({
                kind: 'progress',
                id: matching.length === 1 ? redact(matching[0]!) : null,
                status: event.status,
                message:
                  event.status === 'fail'
                    ? 'Alchemy could not finish this resource. Check permissions and retry after reviewing the remaining state.'
                    : event.status === 'skipped'
                      ? 'Blocked by a resource that could not be deleted.'
                      : matching.length !== 1
                        ? `${redact(event.id)}: ${event.status}`
                        : '',
              });
            }),
          done: () => Effect.void,
        }),
    };
    return yield* Effect.gen(function* () {
      const { plan, fingerprint, resources } = yield* prepare(
        { ...input, selections, before },
        state,
        (event) =>
          emit({ ...event, id: redact(event.id), type: redact(event.type) }),
      );
      const view: typeof deletionPlan.Type = {
        executable: plan !== null,
        stack: input.stack,
        stage: input.stage,
        fingerprint,
        credentials: selections.map(toView),
        resources:
          plan === null
            ? resources.map((resource) => ({
                ...resource,
                id: redact(resource.id),
                type: redact(resource.type),
                reason:
                  resource.reason === null ? null : redact(resource.reason),
                after: resource.after.map(redact),
                previous: resource.previous.map((old) => ({
                  ...old,
                  type: redact(old.type),
                })),
              }))
            : [
                ...Object.values(plan.deletions)
                  .filter((node) => node !== undefined)
                  .map((node) => ({
                    id: redact(node.resource.FQN),
                    type: redact(node.resource.Type),
                    readiness: 'ready' as const,
                    reason: null,
                    action: isForgotten(input.forget, {
                      fqn: node.resource.FQN,
                      resourceType: node.resource.Type,
                    })
                      ? ('forget' as const)
                      : node.resource.RemovalPolicy === 'retain'
                        ? ('retain' as const)
                        : ('delete' as const),
                    after: node.downstream.map(redact),
                    previous: previousGenerations(node.state).map((old) => ({
                      ...old,
                      type: redact(old.type),
                    })),
                  })),
                ...Object.keys(plan.actionDeletions).map((id) => ({
                  id: redact(id),
                  type: 'Action',
                  readiness: 'ready' as const,
                  reason: null,
                  action: 'forget' as const,
                  after: [],
                  previous: [],
                })),
              ].sort((a, b) => a.id.localeCompare(b.id)),
      };
      if (mode === 'preview') return view;
      if (!plan)
        return yield* Effect.fail(
          new PrepareError(
            'Resolve every blocker in the deletion review before deleting this stage.',
          ),
        );
      if (!input.fingerprint || fingerprint !== input.fingerprint)
        return yield* Effect.fail(stageChanged());
      yield* apply(plan);
      emit({
        kind: 'complete',
        id: null,
        status: 'complete',
        message: 'Stage deleted. Alchemy has updated its state.',
      });
      return null;
    }).pipe(
      Effect.provide(providerLayers(selections, input.forget)),
      Effect.provideService(Stack, {
        name: input.stack,
        stage: input.stage,
        resources: {},
        bindings: {},
        actions: {},
      }),
      Effect.provideService(Stage, input.stage),
      Effect.provideService(State, Effect.succeed(state)),
      Effect.provideService(Cli, cli),
      Effect.provideService(ArtifactStore, createArtifactStore()),
      Effect.provideService(AlchemyContext, {
        dotAlchemy: '/tmp/alchemy-console',
        dev: false,
        adopt: false,
      }),
      Effect.provide(PlatformServices),
    );
  }).pipe(
    Effect.provide(
      FetchHttpClient.layer.pipe(
        Layer.provide(
          Layer.succeed(FetchHttpClient.RequestInit, { redirect: 'manual' }),
        ),
      ),
    ),
    Effect.provide(Logger.layer([])),
    Effect.catchCause((cause) => {
      const failure = safeFailure(cause, redact);
      if (mode === 'delete')
        emit({
          kind: 'failed',
          id: null,
          status: 'failed',
          message: failure.error,
        });
      return Effect.succeed(failure);
    }),
  );
};
