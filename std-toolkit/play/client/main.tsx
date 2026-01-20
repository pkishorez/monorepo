import "./styles.css";
import { Effect, Layer, ManagedRuntime, Stream } from "effect";
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { Rpc } from "./services/rpc";
import { RpcWs } from "./services/rpc-ws";

// HTTP RPC runtime
const httpRuntime = ManagedRuntime.make(Rpc.Default);

// WebSocket RPC runtime (lazy - only created when needed)
let wsRuntime: ManagedRuntime.ManagedRuntime<RpcWs, never> | null = null;
const getWsRuntime = () => {
  if (!wsRuntime) {
    wsRuntime = ManagedRuntime.make(RpcWs.Default);
  }
  return wsRuntime;
};

function App() {
  const [response, setResponse] = useState("");
  const [mode, setMode] = useState<"http" | "ws">("http");

  const handlePing = async () => {
    if (mode === "http") {
      const result = await httpRuntime.runPromise(
        Effect.gen(function* () {
          const rpc = yield* Rpc;
          return yield* rpc.Ping();
        }),
      );
      setResponse(`[HTTP] Ping: ${result}`);
    } else {
      const result = await getWsRuntime().runPromise(
        Effect.gen(function* () {
          const rpc = yield* RpcWs;
          return yield* rpc.Ping();
        }),
      );
      setResponse(`[WS] Ping: ${result}`);
    }
  };

  const handleCounter = async () => {
    setResponse(mode === "http" ? "[HTTP] Counter: " : "[WS] Counter: ");
    if (mode === "http") {
      await httpRuntime.runPromise(
        Effect.gen(function* () {
          const rpc = yield* Rpc;
          yield* rpc
            .Counter({ count: 5 })
            .pipe(
              Stream.runForEach((n) =>
                Effect.sync(() => setResponse((prev) => `${prev} ${n}`)),
              ),
            );
        }),
      );
    } else {
      await getWsRuntime().runPromise(
        Effect.gen(function* () {
          const rpc = yield* RpcWs;
          yield* rpc
            .Counter({ count: 5 })
            .pipe(
              Stream.runForEach((n) =>
                Effect.sync(() => setResponse((prev) => `${prev} ${n}`)),
              ),
            );
        }),
      );
    }
  };

  const handleGetUser = async (id: string) => {
    const prefix = mode === "http" ? "[HTTP]" : "[WS]";
    if (mode === "http") {
      const result = await httpRuntime.runPromiseExit(
        Effect.gen(function* () {
          const rpc = yield* Rpc;
          return yield* rpc.GetUser({ id });
        }),
      );
      if (result._tag === "Success") {
        setResponse(
          `${prefix} User: ${result.value.name} (id: ${result.value.id})`,
        );
      } else {
        setResponse(`${prefix} Error: ${JSON.stringify(result.cause)}`);
      }
    } else {
      const result = await getWsRuntime().runPromiseExit(
        Effect.gen(function* () {
          const rpc = yield* RpcWs;
          return yield* rpc.GetUser({ id });
        }),
      );
      if (result._tag === "Success") {
        setResponse(
          `${prefix} User: ${result.value.name} (id: ${result.value.id})`,
        );
      } else {
        setResponse(`${prefix} Error: ${JSON.stringify(result.cause)}`);
      }
    }
  };

  return (
    <main className="min-h-screen bg-neutral-900 text-white flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-5xl font-bold mb-2">Play</h1>
        <p className="text-neutral-400 mb-4">
          Vite + React + Tailwind + Effect RPC
        </p>

        {/* Mode toggle */}
        <div className="flex gap-2 justify-center mb-6">
          <button
            onClick={() => setMode("http")}
            className={`px-4 py-2 rounded-lg cursor-pointer ${
              mode === "http"
                ? "bg-green-600"
                : "bg-neutral-700 hover:bg-neutral-600"
            }`}
          >
            HTTP
          </button>
          <button
            onClick={() => setMode("ws")}
            className={`px-4 py-2 rounded-lg cursor-pointer ${
              mode === "ws"
                ? "bg-green-600"
                : "bg-neutral-700 hover:bg-neutral-600"
            }`}
          >
            WebSocket (DO)
          </button>
        </div>

        <div className="bg-neutral-800 p-4 rounded-lg mb-4 min-h-12">
          {response}
        </div>
        <div className="flex gap-2 justify-center flex-wrap">
          <button
            onClick={handlePing}
            className="bg-indigo-500 hover:bg-indigo-600 px-6 py-3 rounded-lg cursor-pointer"
          >
            Ping
          </button>
          <button
            onClick={handleCounter}
            className="bg-indigo-500 hover:bg-indigo-600 px-6 py-3 rounded-lg cursor-pointer"
          >
            Counter (5)
          </button>
          <button
            onClick={() => handleGetUser("1")}
            className="bg-indigo-500 hover:bg-indigo-600 px-6 py-3 rounded-lg cursor-pointer"
          >
            Get User 1
          </button>
          <button
            onClick={() => handleGetUser("999")}
            className="bg-indigo-500 hover:bg-indigo-600 px-6 py-3 rounded-lg cursor-pointer"
          >
            Get User 999
          </button>
        </div>
      </div>
    </main>
  );
}

createRoot(document.getElementById("app")!).render(<App />);
