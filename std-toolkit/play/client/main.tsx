import "./styles.css";
import { Effect, ManagedRuntime, Stream } from "effect";
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { Rpc } from "./services/rpc";

const runtime = ManagedRuntime.make(Rpc.Default);

function App() {
  const [response, setResponse] = useState("");

  const handlePing = async () => {
    const result = await runtime.runPromise(
      Effect.gen(function* () {
        const rpc = yield* Rpc;
        return yield* rpc.Ping();
      }),
    );
    setResponse(`Ping: ${result}`);
  };

  const handleCounter = async () => {
    setResponse("Counter: ");
    await runtime.runPromise(
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
  };

  const handleGetUser = async (id: string) => {
    const result = await runtime.runPromiseExit(
      Effect.gen(function* () {
        const rpc = yield* Rpc;
        return yield* rpc.GetUser({ id });
      }),
    );
    if (result._tag === "Success") {
      setResponse(`User: ${result.value.name} (id: ${result.value.id})`);
    } else {
      setResponse(`Error: ${JSON.stringify(result.cause)}`);
    }
  };

  return (
    <main className="min-h-screen bg-neutral-900 text-white flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-5xl font-bold mb-2">Play</h1>
        <p className="text-neutral-400 mb-8">
          Vite + React + Tailwind + Effect RPC
        </p>
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
