import { createFileRoute, redirect } from '@tanstack/react-router';
import { HOME } from './lib/sections.ts';

export const Route = createFileRoute('/app-shell/')({
  beforeLoad: () => {
    throw redirect({
      to: '/app-shell/$section',
      params: { section: HOME.slug },
      replace: true,
    });
  },
});
