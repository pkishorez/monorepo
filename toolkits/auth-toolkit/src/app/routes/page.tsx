import { createFileRoute, getRouteApi } from '@tanstack/react-router';
import { HomePage } from '../../ui/pages/home/index.js';

const root = getRouteApi('__root__');

export const Route = createFileRoute('/')({
  ssr: false,
  component: function Home() {
    const { branding, authorizationServer, multiSession } =
      root.useLoaderData();
    return (
      <HomePage
        branding={branding}
        scopes={authorizationServer?.scopes}
        multiSession={multiSession}
      />
    );
  },
});
