import { createFileRoute, redirect } from '@tanstack/react-router';

/** The first Effect Oak demo lived here; it is the Road now. */
export const Route = createFileRoute('/demos/effect-oak/')({
  beforeLoad: () => {
    throw redirect({ to: '/demos/effect-oak/road', replace: true });
  },
});
