import { createFileRoute } from '@tanstack/react-router';
import { Recording, Showreel } from '@/demos/apps/showreel';
import { DemoMenu, demoHead } from '@/lib/demos';

const ShowreelPage = () =>
  Route.useSearch().record ? <Recording /> : <Showreel menu={<DemoMenu />} />;

export const Route = createFileRoute('/demos/apps/showreel')({
  validateSearch: (search: Record<string, unknown>): { record?: 1 } =>
    String(search['record']) === '1' ? { record: 1 } : {},
  component: ShowreelPage,
  head: ({ match }) => demoHead(match.fullPath),
});
