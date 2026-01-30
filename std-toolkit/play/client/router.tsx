import {
  createRouter,
  createRoute,
  createRootRoute,
  Outlet,
  Link,
} from "@tanstack/react-router";
import { UsersRoute } from "./routes/users";
import { StudioRoute } from "./routes/studio";

const routes = [
  {
    id: "users",
    label: "Users",
    description: "TanStack DB + SQLite",
    icon: "👤",
    color: "text-emerald-400",
  },
  {
    id: "studio",
    label: "Studio",
    description: "Entity schema explorer",
    icon: "◈",
    color: "text-blue-400",
  },
] as const;

const rootRoute = createRootRoute({
  component: () => (
    <main className="min-h-screen bg-neutral-950 text-white p-8">
      <Outlet />
    </main>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => (
    <div className="max-w-sm mx-auto pt-24">
      <div className="mb-10 text-center">
        <div className="text-3xl mb-3">⬡</div>
        <h1 className="text-xl font-semibold tracking-tight">std-toolkit</h1>
        <p className="text-neutral-600 text-xs mt-1">playground</p>
      </div>

      <nav className="space-y-2">
        {routes.map((route) => (
          <Link
            key={route.id}
            to={`/${route.id}`}
            className="group flex items-center gap-4 px-4 py-3 rounded-lg border border-transparent hover:border-neutral-800 hover:bg-neutral-900/50 transition-all"
          >
            <span className={`text-lg ${route.color} opacity-60 group-hover:opacity-100 transition-opacity`}>
              {route.icon}
            </span>
            <div className="flex-1">
              <div className="font-medium text-sm group-hover:text-white transition-colors">
                {route.label}
              </div>
              <div className="text-neutral-600 text-xs">{route.description}</div>
            </div>
            <span className="text-neutral-700 group-hover:text-neutral-500 transition-colors">
              →
            </span>
          </Link>
        ))}
      </nav>

      <div className="mt-12 text-center">
        <p className="text-neutral-700 text-xs">Effect + TanStack + Cloudflare</p>
      </div>
    </div>
  ),
});

const layoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "layout",
  component: () => (
    <div>
      <Link
        to="/"
        className="inline-flex items-center gap-2 mb-8 text-neutral-600 hover:text-white text-xs transition-colors group"
      >
        <span className="group-hover:-translate-x-0.5 transition-transform">←</span>
        <span>Back</span>
      </Link>
      <Outlet />
    </div>
  ),
});

const usersRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/users",
  component: UsersRoute,
});

const studioRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/studio",
  component: StudioRoute,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  layoutRoute.addChildren([usersRoute, studioRoute]),
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
