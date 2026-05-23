import { Outlet, createRootRoute } from '@tanstack/react-router';
import '@/styles/app.css';

export const Route = createRootRoute({
  component: () => (
    <div className="h-full antialiased">
      <Outlet />
    </div>
  ),
});
