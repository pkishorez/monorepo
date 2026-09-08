import { tryFindProviderByType } from 'alchemy/Provider';
import { createHash } from 'node:crypto';
import { Effect, Option } from 'effect';
import * as Plan from 'alchemy/Plan';
import { stampedMode } from 'alchemy/ProviderMode';
import type { ResourceState, StateService } from 'alchemy/State';
import { isActionState } from 'alchemy/State';
import { encodeState } from 'alchemy/State/StateEncoding';
import { verifyZones } from './resource-scopes.ts';

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

export const prepare = (
  input: {
    stack: string;
    stage: string;
    connection: { accountId: string; apiToken: string };
  },
  state: StateService,
) =>
  Effect.gen(function* () {
    const target = { stack: input.stack, stage: input.stage };
    const snapshot = () =>
      Effect.gen(function* () {
        const stages = yield* state.listStages(input.stack);
        if (!stages.includes(input.stage))
          return yield* Effect.fail(new Error('This stage no longer exists.'));
        const ids = [...(yield* state.list(target))].sort();
        const rows = yield* Effect.forEach(
          ids,
          (fqn) => state.get({ ...target, fqn }),
          { concurrency: 4 },
        );
        const replaced = yield* state.getReplacedResources(target);
        const generations: ResourceState[] = [];
        const validate = (row: ResourceState): void => {
          generations.push(row);
          if (
            (!row.resourceType.startsWith('Cloudflare.') &&
              !['Random', 'KeyPair'].includes(row.resourceType)) ||
            stampedMode(row) === 'local'
          )
            throw new Error(
              'This stage contains unsupported or local resource types.',
            );
          for (const value of [row.props, row.attr]) {
            if (
              value &&
              typeof value === 'object' &&
              'accountId' in value &&
              typeof value.accountId === 'string' &&
              value.accountId !== input.connection.accountId
            )
              throw new Error(
                'The stage contains resources from a different Cloudflare account.',
              );
          }
          if (row.status === 'replacing' || row.status === 'replaced')
            validate(row.old);
        };
        yield* Effect.try({
          try: () => {
            for (const row of [...rows, ...replaced])
              if (row && !isActionState(row)) validate(row);
          },
          catch: (error) => error,
        });
        for (const row of generations) {
          if (
            Option.isNone(
              yield* tryFindProviderByType(row.resourceType, 'live'),
            )
          )
            return yield* Effect.fail(
              new Error(
                'This stage contains resource types that cannot yet be deleted from a Worker.',
              ),
            );
        }
        yield* verifyZones(input.connection, generations);
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
    const fingerprint = yield* snapshot();
    const plan = yield* Plan.destroy({ name: input.stack, stage: input.stage });
    if (fingerprint !== (yield* snapshot()))
      return yield* Effect.fail(
        new Error('The stage changed. Review a new deletion plan.'),
      );
    return { plan, fingerprint };
  });
