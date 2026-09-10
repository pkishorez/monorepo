import { Cause, Effect, Layer, Logger, Redacted } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';
import { Stack } from 'alchemy/Stack';
import { Stage } from 'alchemy/Stage';
import {
  Credentials,
  apiTokenCredentials,
} from '@distilled.cloud/cloudflare/Credentials';
import { CloudflareEnvironment } from 'alchemy/Cloudflare';
import { providers } from './providers.ts';
import { State } from 'alchemy/State';
import { makeHttpStateStore } from 'alchemy/State/HttpStateStore';
import { PlatformServices } from 'alchemy/Util/PlatformServices';
import { AlchemyContext } from 'alchemy/AlchemyContext';
import { ArtifactStore, createArtifactStore } from 'alchemy/Artifacts';
import { Cli } from 'alchemy/Cli/Cli';
import { apply } from 'alchemy/Apply';
import { destructionRequest } from './request.ts';
import type {
  analysisEvent,
  deletionEvent,
  deletionPlan,
} from '../../../shared/contracts/delete-stage/index.ts';
import { PrepareError, prepare, stageChanged } from './prepare.ts';
import type { ResourceState } from 'alchemy/State';

export type EngineEvent = typeof deletionEvent.Type | typeof analysisEvent.Type;
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
      'Alchemy could not complete this operation. Check that the token covers every resource and zone, then refresh the stage and review a new plan before retrying. Remaining state has been preserved.',
    resource: null,
  };
};

export const execute = (
  input: typeof destructionRequest.Type,
  mode: 'preview' | 'delete',
  emit: (event: EngineEvent) => void,
) => {
  const redact = (text: string) =>
    [input.connection.apiToken, input.connection.authToken].reduce(
      (s, secret) => s.replaceAll(secret, 'xxxxxxxx'),
      text,
    );
  return Effect.gen(function* () {
    const state = yield* makeHttpStateStore({
      ...input.connection,
      id: 'http',
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
      const { plan, fingerprint } = yield* prepare(input, state, (event) =>
        emit({ ...event, id: redact(event.id), type: redact(event.type) }),
      );
      const view: typeof deletionPlan.Type = {
        stack: input.stack,
        stage: input.stage,
        accountId: input.connection.accountId,
        fingerprint,
        resources: [
          ...Object.values(plan.deletions)
            .filter((node) => node !== undefined)
            .map((node) => ({
              id: redact(node.resource.FQN),
              type: redact(node.resource.Type),
              action:
                node.resource.RemovalPolicy === 'retain'
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
            action: 'forget' as const,
            after: [],
            previous: [],
          })),
        ].sort((a, b) => a.id.localeCompare(b.id)),
      };
      if (mode === 'preview') return view;
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
      Effect.provide(providers()),
      Effect.provideService(Stack, {
        name: input.stack,
        stage: input.stage,
        resources: {},
        bindings: {},
        actions: {},
      }),
      Effect.provideService(Stage, input.stage),
      Effect.provideService(
        Credentials,
        Effect.succeed(
          apiTokenCredentials({ apiToken: input.connection.apiToken }),
        ),
      ),
      Effect.provideService(
        CloudflareEnvironment,
        Effect.succeed({
          type: 'apiToken',
          apiToken: Redacted.make(input.connection.apiToken),
          accountId: input.connection.accountId,
          source: { type: 'env' },
        }),
      ),
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
