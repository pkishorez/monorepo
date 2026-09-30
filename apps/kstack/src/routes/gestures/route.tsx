import { createFileRoute, Outlet } from '@tanstack/react-router';
import { GesturesShowcase } from '../../showcases/gestures/index.ts';

export const Route = createFileRoute('/gestures')({
  component: () => (
    <GesturesShowcase>
      <Outlet />
    </GesturesShowcase>
  ),
});
