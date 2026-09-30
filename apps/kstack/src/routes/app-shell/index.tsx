import { createFileRoute, redirect } from '@tanstack/react-router';
import { HOME_SLUG } from '../../showcases/app-shell/index.ts';

export const Route = createFileRoute('/app-shell/')({
  beforeLoad: () => {
    throw redirect({
      to: '/app-shell/$section',
      params: { section: HOME_SLUG },
      replace: true,
    });
  },
});
