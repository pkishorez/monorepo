import { createFileRoute } from '@tanstack/react-router';
import { NAMES, Rockets, type AppName } from '@/demos/effect-oak/rockets';
import { DemoMenu, demoHead } from '@/lib/demos';

const RocketsPage = () => {
  const { app } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <Rockets
      app={app}
      menu={<DemoMenu />}
      onApp={(next) => navigate({ search: { app: next }, replace: true })}
    />
  );
};

export const Route = createFileRoute('/demos/effect-oak/rockets')({
  validateSearch: (search: Record<string, unknown>): { app: AppName } => ({
    app: NAMES.includes(search['app'] as AppName)
      ? (search['app'] as AppName)
      : 'capabilities',
  }),
  component: RocketsPage,
  ssr: false,
  head: ({ match }) => demoHead(match.fullPath),
});
