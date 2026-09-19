import { createFileRoute, getRouteApi } from '@tanstack/react-router';
import { ErrorScreen } from 'kui-toolkit/components/blocks/auth';

const root = getRouteApi('__root__');

export const Route = createFileRoute('/error')({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    error: typeof search.error === 'string' ? search.error : undefined,
    error_description:
      typeof search.error_description === 'string'
        ? search.error_description
        : undefined,
  }),
  component: function ErrorPage() {
    const { error, error_description } = Route.useSearch();
    return (
      <ErrorScreen
        branding={root.useLoaderData().branding}
        error={error}
        description={error_description}
      />
    );
  },
});
