import { homedir } from 'node:os';
import path from 'node:path';
import { Effect } from 'effect';
import { analyzeProject } from 'laymos/node';
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

/** Analyze the package and return its laymos report. */
export const assembleLaymos = (dir: string) =>
  analyzeProject(dir).pipe(
    Effect.map((data) => ({ available: true as const, data })),
    Effect.mapError(toError),
  );
