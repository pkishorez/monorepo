import { createFileRoute, getRouteApi } from '@tanstack/react-router';
import { LoginPage } from '../../pages/login/index.js';

const root = getRouteApi('__root__');

export const Route = createFileRoute('/login')({
  ssr: false,
  component: function Login() {
    const { branding, multiSession, testSignIn } = root.useLoaderData();
    return (
      <LoginPage
        branding={branding}
        multiSession={multiSession}
        testSignIn={testSignIn}
      />
    );
  },
});
