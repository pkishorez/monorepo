import { tryFindProviderByType } from 'alchemy/Provider';
import { createHash } from 'node:crypto';
import { Effect, Option } from 'effect';
import * as Plan from 'alchemy/Plan';
import { stampedMode } from 'alchemy/ProviderMode';
import type { ResourceState, StateService } from 'alchemy/State';
import { isActionState } from 'alchemy/State';
import { encodeState } from 'alchemy/State/StateEncoding';
import type { analysisEvent } from '../../../shared/contracts/delete-stage/index.ts';
import { FetchHttpClient } from 'effect/unstable/http';
import {
  Credentials,
  apiTokenCredentials,
} from '@distilled.cloud/cloudflare/Credentials';
import { getZone } from '@distilled.cloud/cloudflare/zones';

/**
 * A planning failure safe to show to the user. `resource` names the state row
 * being analyzed when the failure happened, or null for stage-level failures.
 */
export class PrepareError extends Error {
  constructor(
    message: string,
    readonly resource: string | null = null,
  ) {
    super(message);
    this.name = 'PrepareError';
  }
}

export const stageChanged = () =>
  new PrepareError('The stage changed. Review a new deletion plan.');

const stable = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(stable)
    : value !== null && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, v]) => [key, stable(v)]),
        )
      : value;

const generations = (row: ResourceState): ResourceState[] =>
  row.status === 'replacing' || row.status === 'replaced'
    ? [row, ...generations(row.old)]
    : [row];

const supported = (type: string) =>
  type.startsWith('Cloudflare.') || ['Random', 'KeyPair'].includes(type);

export const prepare = (
  input: {
    stack: string;
    stage: string;
    connection: { accountId: string; apiToken: string };
  },
  state: StateService,
  emit: (event: typeof analysisEvent.Type) => void = () => {},
) =>
  Effect.gen(function* () {
    const target = { stack: input.stack, stage: input.stage };
    const snapshot = (report: typeof emit) =>
      Effect.gen(function* () {
        const stages = yield* state.listStages(input.stack);
        if (!stages.includes(input.stage))
          return yield* Effect.fail(
            new PrepareError('This stage no longer exists.'),
          );
        const ids = [...(yield* state.list(target))].sort();
        const rows = yield* Effect.forEach(
          ids,
          (fqn) => state.get({ ...target, fqn }),
          { concurrency: 4 },
        );
        const replaced = yield* state.getReplacedResources(target);
        const verifiedZones = new Set<string>();
        const analyze = (row: ResourceState) =>
          Effect.gen(function* () {
            const fail = (message: string) =>
              Effect.fail(new PrepareError(message, row.fqn));
            report({ kind: 'analyzing', id: row.fqn, type: row.resourceType });
            for (const generation of generations(row)) {
              const type = generation.resourceType;
              const label =
                generation === row
                  ? type
                  : `a previous version of this resource (${type})`;
              if (!supported(type))
                return yield* fail(
                  `${label} is not a Cloudflare resource. The console can only delete Cloudflare resources; delete this stage with \`alchemy destroy\` from the project instead.`,
                );
              if (stampedMode(generation) === 'local')
                return yield* fail(
                  `${label} was created by \`alchemy dev\` in local mode and has no cloud resource the console can delete.`,
                );
              for (const value of [generation.props, generation.attr]) {
                if (
                  value &&
                  typeof value === 'object' &&
                  'accountId' in value &&
                  typeof value.accountId === 'string' &&
                  value.accountId !== input.connection.accountId
                )
                  return yield* fail(
                    `${label} belongs to a different Cloudflare account than this connection.`,
                  );
              }
              if (Option.isNone(yield* tryFindProviderByType(type, 'live')))
                return yield* fail(
                  `${label} cannot yet be deleted from a Worker: the console has no live provider for it.`,
                );
            }
            yield* verifyZones(
              input.connection,
              generations(row),
              verifiedZones,
            ).pipe(
              Effect.mapError(
                () =>
                  new PrepareError(
                    `${row.resourceType} uses a zone that belongs to a different Cloudflare account than this connection.`,
                    row.fqn,
                  ),
              ),
            );
            report({ kind: 'analyzed', id: row.fqn, type: row.resourceType });
          });
        for (const row of [...rows, ...replaced])
          if (row && !isActionState(row)) yield* analyze(row);
        const output = yield* state.getOutput(target);
        return createHash('sha256')
          .update(
            JSON.stringify(
              stable(
                encodeState({
                  ...target,
                  accountId: input.connection.accountId,
                  ids,
                  rows,
                  replaced,
                  output,
                }),
              ),
            ),
          )
          .digest('hex');
      });
    const fingerprint = yield* snapshot(emit);
    const plan = yield* Plan.destroy({ name: input.stack, stage: input.stage });
    if (fingerprint !== (yield* snapshot(() => {})))
      return yield* Effect.fail(stageChanged());
    return { plan, fingerprint };
  });

// Zones are looked up with the saved token; a zone owned elsewhere blocks the plan.
const verifyZones = (
  connection: { accountId: string; apiToken: string },
  rows: readonly ResourceState[],
  verified: Set<string> = new Set(),
) => {
  const zones = new Set<string>();
  const collect = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if ((key === 'zoneId' || key === 'zone_id') && typeof item === 'string') {
        if (!verified.has(item)) zones.add(item);
      } else if (item && typeof item === 'object') collect(item);
    }
  };
  for (const row of rows) {
    collect(row.props);
    collect(row.attr);
  }
  return Effect.forEach(
    [...zones],
    (zoneId) =>
      getZone({ zoneId }).pipe(
        Effect.flatMap((zone) =>
          zone.account.id?.toLowerCase() === connection.accountId.toLowerCase()
            ? Effect.sync(() => {
                verified.add(zoneId);
              })
            : Effect.fail(
                new Error(
                  'The stage contains resources from a different Cloudflare account.',
                ),
              ),
        ),
      ),
    { concurrency: 4 },
  ).pipe(
    Effect.provideService(
      Credentials,
      Effect.succeed(apiTokenCredentials({ apiToken: connection.apiToken })),
    ),
    Effect.provide(FetchHttpClient.layer),
    Effect.provideService(FetchHttpClient.RequestInit, { redirect: 'manual' }),
  );
};
