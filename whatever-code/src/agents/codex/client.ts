import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { Deferred, Effect } from "effect";
import type { ClientRequest } from "./generated/ClientRequest.js";
import type { ServerNotification } from "./generated/ServerNotification.js";
import type { ServerRequest } from "./generated/ServerRequest.js";
import type { RequestId } from "./generated/RequestId.js";

type ClientRequestMethod = ClientRequest["method"];
type ClientRequestByMethod<M extends ClientRequestMethod> = Extract<
  ClientRequest,
  { method: M }
>;

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: unknown;
};

type JsonRpcNotification = {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
};

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

type NotificationHandler = (notification: ServerNotification) => void;
type ServerRequestHandler = (
  id: RequestId,
  request: ServerRequest,
) => void;

export class CodexClientError {
  readonly _tag = "CodexClientError";
  constructor(readonly message: string) {}
}

export class CodexClient extends Effect.Service<CodexClient>()(
  "CodexClient",
  {
    scoped: Effect.gen(function* () {
      let nextId = 1;
      let process: ChildProcess | null = null;
      const pending = new Map<number, Deferred.Deferred<unknown, CodexClientError>>();
      let notificationHandler: NotificationHandler | null = null;
      let serverRequestHandler: ServerRequestHandler | null = null;

      const spawnProcess = () => {
        const child = spawn("codex", ["app-server", "--listen", "stdio://"], {
          stdio: ["pipe", "pipe", "pipe"],
        });

        const rl = createInterface({ input: child.stdout! });

        rl.on("line", (line) => {
          if (!line.trim()) return;
          let msg: unknown;
          try {
            msg = JSON.parse(line);
          } catch (e) {
            Effect.runFork(
              Effect.logError("codex: failed to parse line from subprocess").pipe(
                Effect.annotateLogs({ line, error: String(e) }),
              ),
            );
            return;
          }

          if (
            msg !== null &&
            typeof msg === "object" &&
            "id" in msg &&
            ("result" in msg || "error" in msg)
          ) {
            const response = msg as JsonRpcResponse;
            const deferred = pending.get(response.id);
            if (deferred) {
              pending.delete(response.id);
              if (response.error) {
                Effect.runFork(
                  Effect.logError("codex: received error response").pipe(
                    Effect.annotateLogs({
                      requestId: response.id,
                      errorCode: response.error.code,
                      errorMessage: response.error.message,
                    }),
                    Effect.andThen(
                      Deferred.fail(
                        deferred,
                        new CodexClientError(response.error.message),
                      ),
                    ),
                  ),
                );
              } else {
                Effect.runFork(Deferred.succeed(deferred, response.result));
              }
            } else {
              Effect.runFork(
                Effect.logWarning("codex: received response for unknown request id").pipe(
                  Effect.annotateLogs({ requestId: response.id }),
                ),
              );
            }
            return;
          }

          if (
            msg !== null &&
            typeof msg === "object" &&
            "method" in msg &&
            !("id" in msg)
          ) {
            if (notificationHandler) {
              notificationHandler(msg as ServerNotification);
            }
            return;
          }

          if (
            msg !== null &&
            typeof msg === "object" &&
            "method" in msg &&
            "id" in msg &&
            !("result" in msg)
          ) {
            if (serverRequestHandler) {
              serverRequestHandler(
                (msg as { id: RequestId }).id,
                msg as ServerRequest,
              );
            }
            return;
          }

          Effect.runFork(
            Effect.logWarning("codex: received unrecognized message from subprocess").pipe(
              Effect.annotateLogs({ line }),
            ),
          );
        });

        child.on("exit", (code, signal) => {
          if (pending.size > 0) {
            Effect.runFork(
              Effect.logError("codex: subprocess exited with pending requests").pipe(
                Effect.annotateLogs({
                  exitCode: code ?? "null",
                  signal: signal ?? "null",
                  pendingCount: pending.size,
                }),
              ),
            );
          }
          for (const [id, deferred] of pending) {
            pending.delete(id);
            Effect.runFork(
              Deferred.fail(deferred, new CodexClientError("process exited")),
            );
          }
        });

        child.stderr!.on("data", (chunk: Buffer) => {
          const text = chunk.toString().trim();
          if (text) {
            Effect.runFork(
              Effect.logWarning("codex: subprocess stderr").pipe(
                Effect.annotateLogs({ stderr: text }),
              ),
            );
          }
        });

        return child;
      };

      const write = (msg: JsonRpcRequest | JsonRpcNotification | JsonRpcResponse) => {
        if (!process?.stdin?.writable) return;
        process.stdin.write(JSON.stringify(msg) + "\n");
      };

      const request = <M extends ClientRequestMethod>(
        method: M,
        params: ClientRequestByMethod<M> extends { params: infer P }
          ? P
          : undefined,
      ): Effect.Effect<unknown, CodexClientError> =>
        Effect.gen(function* () {
          const id = nextId++;
          const deferred = yield* Deferred.make<unknown, CodexClientError>();
          pending.set(id, deferred);
          write({
            jsonrpc: "2.0",
            id,
            method,
            ...(params !== undefined ? { params } : {}),
          });
          return yield* Deferred.await(deferred);
        });

      const respond = (id: RequestId, result: unknown) => {
        write({ jsonrpc: "2.0", id: id as number, result });
      };

      const onNotification = (handler: NotificationHandler) => {
        notificationHandler = handler;
      };

      const onServerRequest = (handler: ServerRequestHandler) => {
        serverRequestHandler = handler;
      };

      // Spawn + initialize
      process = spawnProcess();

      yield* request("initialize", {
        clientInfo: { name: "whatever-code", title: null, version: "0.1.0" },
        capabilities: { experimentalApi: true },
      });

      write({ jsonrpc: "2.0", method: "initialized" });

      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          process?.kill();
          process = null;
        }),
      );

      return { request, respond, onNotification, onServerRequest };
    }),
  },
) {}
