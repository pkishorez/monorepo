import { createFileRoute, Outlet } from '@tanstack/react-router';
import { AppShellShowcase } from '../../showcases/app-shell/index.ts';

export const Route = createFileRoute('/app-shell')({
  component: () => (
    <AppShellShowcase>
      <Outlet />
    </AppShellShowcase>
  ),
});
