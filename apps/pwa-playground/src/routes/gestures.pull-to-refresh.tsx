import { createFileRoute } from '@tanstack/react-router';
import { BackToGestures, ThemeToggle } from '../components/index.ts';
import { PullToRefreshDemo } from './-patterns/index.ts';

export const Route = createFileRoute('/gestures/pull-to-refresh')({
  staticData: { chrome: 'bare' },
  component: () => (
    <PullToRefreshDemo start={<BackToGestures />} end={<ThemeToggle />} />
  ),
});
