import "./styles.css";
import { Effect, ManagedRuntime, Stream } from "effect";
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { RpcWs } from "./services/rpc-ws";

// WebSocket RPC runtime
const wsRuntime = ManagedRuntime.make(RpcWs.Default);

function App() {
  const [response, setResponse] = useState("");

  const handlePing = async () => {
    const result = await wsRuntime.runPromise(
      RpcWs.use((rpc) => rpc.Ping()),
    );
    setResponse(`Ping: ${result}`);
  };

  const handleCounter = async () => {
    setResponse("Counter: ");
    await wsRuntime.runPromise(
      RpcWs.use((rpc) =>
        rpc
          .Counter({ count: 30 })
          .pipe(
            Stream.runForEach((n) =>
              Effect.sync(() => setResponse((prev) => `${prev} ${n}`)),
            ),
          ),
      ),
    );
  };

  const handleGetUser = async (id: string) => {
    const result = await wsRuntime.runPromiseExit(
      RpcWs.use((rpc) => rpc.GetUser({ id })),
    );
    if (result._tag === "Success") {
      const user = result.value.value;
      setResponse(`User: ${user.name} (id: ${user.id})`);
    } else {
      setResponse(`Error: ${JSON.stringify(result.cause)}`);
    }
  };

  const handleCreateUser = async () => {
    const result = await wsRuntime.runPromiseExit(
      RpcWs.use((rpc) =>
        rpc.CreateUser({
          name: `User ${Date.now()}`,
          email: `user${Date.now()}@example.com`,
        }),
      ),
    );
    if (result._tag === "Success") {
      const user = result.value.value;
      setResponse(`Created: ${user.name} (id: ${user.id})`);
    } else {
      setResponse(`Error: ${JSON.stringify(result.cause)}`);
    }
  };

  const handleListUsers = async () => {
    const result = await wsRuntime.runPromiseExit(
      RpcWs.use((rpc) => rpc.ListUsers({ limit: 10 })),
    );
    if (result._tag === "Success") {
      const users = result.value.items.map((u) => u.value.name).join(", ");
      setResponse(`Users: ${users || "(none)"}`);
    } else {
      setResponse(`Error: ${JSON.stringify(result.cause)}`);
    }
  };

  return (
    <main className="min-h-screen bg-neutral-900 text-white flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-5xl font-bold mb-2">Play</h1>
        <p className="text-neutral-400 mb-4">
          Vite + React + Tailwind + Effect RPC (WebSocket)
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
            Counter (30)
          </button>
          <button
            onClick={handleCreateUser}
            className="bg-green-500 hover:bg-green-600 px-6 py-3 rounded-lg cursor-pointer"
          >
            Create User
          </button>
          <button
            onClick={handleListUsers}
            className="bg-blue-500 hover:bg-blue-600 px-6 py-3 rounded-lg cursor-pointer"
          >
            List Users
          </button>
          <button
            onClick={() => handleGetUser("user_1234")}
            className="bg-purple-500 hover:bg-purple-600 px-6 py-3 rounded-lg cursor-pointer"
          >
            Get User (invalid)
          </button>
        </div>
      </div>
    </main>
  );
}

createRoot(document.getElementById("app")!).render(<App />);
