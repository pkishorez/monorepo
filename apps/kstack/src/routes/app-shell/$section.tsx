import { createFileRoute, notFound } from '@tanstack/react-router';
import { SectionPage } from './components/section-page.tsx';
import { sectionAt } from './lib/sections.ts';

export const Route = createFileRoute('/app-shell/$section')({
  beforeLoad: ({ params }) => {
    if (sectionAt(params.section) === undefined) throw notFound();
  },
  component: function Section() {
    const { section } = Route.useParams();
    const found = sectionAt(section);
    return found === undefined ? null : <SectionPage section={found} />;
  },
});
