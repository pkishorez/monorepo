import { createFileRoute, notFound } from '@tanstack/react-router';
import { hasSection, SectionPage } from '../../showcases/app-shell/index.ts';

export const Route = createFileRoute('/app-shell/$section')({
  beforeLoad: ({ params }) => {
    if (!hasSection(params.section)) throw notFound();
  },
  component: function Section() {
    const { section } = Route.useParams();
    return <SectionPage slug={section} />;
  },
});
