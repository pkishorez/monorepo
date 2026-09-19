import { createFileRoute, getRouteApi } from '@tanstack/react-router';
import { LoginPage } from '../../ui/pages/login/index.js';

const root = getRouteApi('__root__');

export const Route = createFileRoute('/login')({
  ssr: false,
  component: () => <LoginPage branding={root.useLoaderData().branding} />,
});
