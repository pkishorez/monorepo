import { createFileRoute, redirect } from '@tanstack/react-router';
import { FIRST_TOPIC } from '../../showcases/gestures/index.ts';

export const Route = createFileRoute('/gestures/')({
  beforeLoad: () => {
    throw redirect({
      to: '/gestures/$topic',
      params: { topic: FIRST_TOPIC },
      replace: true,
    });
  },
});
