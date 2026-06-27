import { homedir } from 'node:os';
import path from 'node:path';
import { Effect } from 'effect';
import { cruiseProject } from 'depcruise-viz/node';
import { DevtoolsRpcError } from '../rpc/index.js';

/** Resolve an input path to an absolute path, expanding a leading `~`. */
export const resolvePath = (input: string): string =>
  path.resolve(
    input === '~' || input.startsWith('~/')
      ? path.join(homedir(), input.slice(1))
      : input,
  );

export const toError = (cause: unknown): DevtoolsRpcError =>
  cause instanceof DevtoolsRpcError
    ? cause
    : new DevtoolsRpcError({ message: String(cause) });

/** Cruise the package and return the visualization data payload. */
export const assembleDepcruise = (dir: string) =>
  Effect.map(
    Effect.tryPromise({ try: () => cruiseProject(dir), catch: toError }),
    (result) => ({
      available: true as const,
      data: { config: result.config, summary: result.summary },
    }),
  );
