import { createFileRoute } from '@tanstack/react-router';
import { BackToGestures, ThemeToggle } from '../components/index.ts';
import { SidebarDemo } from './-patterns/index.ts';

export const Route = createFileRoute('/gestures/sidebar')({
  staticData: { chrome: 'bare' },
  component: () => (
    <SidebarDemo start={<BackToGestures />} end={<ThemeToggle />} />
  ),
});
