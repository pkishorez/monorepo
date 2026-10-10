import { createFileRoute } from '@tanstack/react-router';
import { CHAPTERS, LOOKS, Rockets } from '@/demos/effect-oak/rockets';
import type { RocketsSearch } from '@/demos/effect-oak/rockets';
import { DemoMenu, demoHead } from '@/lib/demos';

const RocketsPage = () => {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <Rockets
      search={search}
      menu={<DemoMenu />}
      onChange={(next) =>
        navigate({
          search: (previous) => ({ ...previous, ...next }),
          replace: true,
        })
      }
    />
  );
};

export const Route = createFileRoute('/demos/effect-oak/rockets')({
  validateSearch: (search: Record<string, unknown>): RocketsSearch => {
    const chapter = Number(search['chapter']);
    const look = String(search['look']);
    return {
      chapter: (chapter >= 1 && chapter <= CHAPTERS.length
        ? Math.floor(chapter)
        : 1) as RocketsSearch['chapter'],
      look: look in LOOKS ? (look as RocketsSearch['look']) : 'exotic',
      ...(String(search['chrome']) === '0' && { chrome: 0 }),
    };
  },
  component: RocketsPage,
  ssr: false,
  head: ({ match }) => demoHead(match.fullPath),
});
