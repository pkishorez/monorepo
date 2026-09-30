import { createFileRoute, notFound } from '@tanstack/react-router';
import { FeatureScreen, hasFeature } from '../../showcases/features/index.ts';

export const Route = createFileRoute('/features/$feature')({
  beforeLoad: ({ params }) => {
    if (!hasFeature(params.feature)) throw notFound();
  },
  component: function Feature() {
    const { feature } = Route.useParams();
    return <FeatureScreen slug={feature} />;
  },
});
