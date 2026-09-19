import { createFileRoute, getRouteApi } from '@tanstack/react-router';
import { DevicePage } from '../../ui/pages/device/index.js';

const root = getRouteApi('__root__');

export const Route = createFileRoute('/device')({
  ssr: false,
  component: () => <DevicePage branding={root.useLoaderData().branding} />,
});
