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
  { id: "users", label: "Users", description: "Manage users with TanStack DB" },
  { id: "studio", label: "Studio", description: "Studio workspace" },
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
  component: function Index() {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Playground</h1>
          <p className="text-neutral-400">std-toolkit demo application</p>
        </div>

        <div className="space-y-3">
          {routes.map((route) => (
            <Link
              key={route.id}
              to={`/${route.id}`}
              className="block w-full bg-neutral-800/50 border border-neutral-700 p-5 rounded-xl text-left hover:border-neutral-500 hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <div className="font-medium text-lg">{route.label}</div>
              <div className="text-neutral-400 text-sm">{route.description}</div>
            </Link>
          ))}
        </div>
      </div>
    );
  },
});

function RouteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <Link
        to="/"
        className="mb-6 text-neutral-400 hover:text-white transition-colors cursor-pointer flex items-center gap-2"
      >
        <span>&larr;</span>
        <span>Back to routes</span>
      </Link>
      {children}
    </div>
  );
}

const usersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/users",
  component: function Users() {
    return (
      <RouteLayout>
        <UsersRoute />
      </RouteLayout>
    );
  },
});

const studioRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/studio",
  component: function Studio() {
    return (
      <RouteLayout>
        <StudioRoute />
      </RouteLayout>
    );
  },
});

const routeTree = rootRoute.addChildren([indexRoute, usersRoute, studioRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
