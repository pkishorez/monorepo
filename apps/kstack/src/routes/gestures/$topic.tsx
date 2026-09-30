import { createFileRoute, notFound } from '@tanstack/react-router';
import { hasTopic, TopicPage } from '../../showcases/gestures/index.ts';

export const Route = createFileRoute('/gestures/$topic')({
  beforeLoad: ({ params }) => {
    if (!hasTopic(params.topic)) throw notFound();
  },
  component: function Topic() {
    const { topic } = Route.useParams();
    return <TopicPage slug={topic} />;
  },
});
