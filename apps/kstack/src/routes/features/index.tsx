import { createFileRoute } from '@tanstack/react-router';
import { FeatureList } from '../../showcases/features/index.ts';

export const Route = createFileRoute('/features/')({
  component: FeatureList,
});
