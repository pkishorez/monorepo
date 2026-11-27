import { Effect, Layer } from 'effect';
import { FetchHttpClient, HttpClient, HttpClientRequest } from 'effect/http';
import { RpcClient, RpcSerialization } from 'effect/rpc';
import {
  MONOVERSE_RPC_PATH,
  MonoverseRpc,
} from '../../../monoverse/server/rpc/contract/index.js';
import { ProjectRegistry, ProjectRegistryProblem } from '../contract/index.js';

const UNREACHABLE = 'The DevTools server could not be reached: ';

const worktreesProblem = (error: {
  readonly _tag: string;
  readonly message: string;
}) => {
  switch (error._tag) {
    case 'InvalidRootError':
      return "The Project's folder is not there any more.";
    case 'GitUnavailableError':
      return "The Project's repository could not be read with git.";
    default:
      return `${UNREACHABLE}${error.message}`;
  }
};

export const projectRegistryLayer = (origin: string) =>
  Layer.effect(
    ProjectRegistry,
    Effect.map(RpcClient.make(MonoverseRpc), (client) =>
      ProjectRegistry.of({
        projects: client.ListProjects().pipe(
          Effect.map((entries) =>
            entries.map(({ id, name, path }) => ({ id, name, path })),
          ),
          Effect.mapError(
            (error) =>
              new ProjectRegistryProblem({
                message:
                  error._tag === 'ProjectRegistryError'
                    ? error.message
                    : `${UNREACHABLE}${error.message}`,
              }),
          ),
        ),
        worktrees: (path) =>
          client.GetWorktrees({ root: path }).pipe(
            Effect.mapError(
              (error) =>
                new ProjectRegistryProblem({
                  message: worktreesProblem(error),
                }),
            ),
          ),
      }),
    ),
  ).pipe(
    Layer.provide(
      RpcClient.layerProtocolHttp({
        url: origin,
        transformClient: HttpClient.mapRequest(
          HttpClientRequest.appendUrl(MONOVERSE_RPC_PATH),
        ),
      }),
    ),
    Layer.provide(RpcSerialization.layerNdjson),
    Layer.provide(FetchHttpClient.layer),
  );
