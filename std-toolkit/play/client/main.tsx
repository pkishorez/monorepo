import "./styles.css";
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { UsersRoute } from "./routes/users";

type Route = "home" | "users";

const routes = [
  { id: "users" as const, label: "Users", description: "Manage users with TanStack DB" },
] as const;

function App() {
  const [currentRoute, setCurrentRoute] = useState<Route>("home");

  return (
    <main className="min-h-screen bg-neutral-950 text-white p-8">
      {currentRoute === "home" ? (
        <div className="max-w-3xl mx-auto">
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-2">Playground</h1>
            <p className="text-neutral-400">std-toolkit demo application</p>
          </div>

          <div className="space-y-3">
            {routes.map((route) => (
              <button
                key={route.id}
                onClick={() => setCurrentRoute(route.id)}
                className="w-full bg-neutral-800/50 border border-neutral-700 p-5 rounded-xl text-left hover:border-neutral-500 hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                <div className="font-medium text-lg">{route.label}</div>
                <div className="text-neutral-400 text-sm">{route.description}</div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div>
          <button
            onClick={() => setCurrentRoute("home")}
            className="mb-6 text-neutral-400 hover:text-white transition-colors cursor-pointer flex items-center gap-2"
          >
            <span>&larr;</span>
            <span>Back to routes</span>
          </button>
          {currentRoute === "users" && <UsersRoute />}
        </div>
      )}
    </main>
  );
}

createRoot(document.getElementById("app")!).render(<App />);
