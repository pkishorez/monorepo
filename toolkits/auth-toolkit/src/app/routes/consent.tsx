import { createFileRoute, getRouteApi } from '@tanstack/react-router';
import { ConsentPage } from '../../ui/pages/consent/index.js';

const root = getRouteApi('__root__');

export const Route = createFileRoute('/consent')({
  ssr: false,
  component: function Consent() {
    const { branding, authorizationServer, multiSession } =
      root.useLoaderData();
    return (
      <ConsentPage
        branding={branding}
        scopes={authorizationServer?.scopes}
        multiSession={multiSession}
      />
    );
  },
});
