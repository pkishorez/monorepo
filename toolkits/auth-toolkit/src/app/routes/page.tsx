import { createFileRoute, getRouteApi } from '@tanstack/react-router';
import { AccountPage } from '../../ui/pages/account/index.js';

const root = getRouteApi('__root__');

export const Route = createFileRoute('/')({
  ssr: false,
  component: () => <AccountPage branding={root.useLoaderData()} />,
});
