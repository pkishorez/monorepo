import { createFileRoute, Outlet } from '@tanstack/react-router';
import { Example } from './components/example.tsx';

export const Route = createFileRoute('/app-shell')({
  component: () => (
    <Example>
      <Outlet />
    </Example>
  ),
});
