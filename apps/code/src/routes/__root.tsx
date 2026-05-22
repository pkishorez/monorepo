import { Outlet, createRootRoute } from '@tanstack/react-router';
import '@/styles/app.css';

export const Route = createRootRoute({
  component: () => (
    <div className="bg-background text-foreground min-h-screen antialiased">
      <Outlet />
    </div>
  ),
});
