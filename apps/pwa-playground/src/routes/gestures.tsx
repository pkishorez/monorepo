import { createFileRoute } from '@tanstack/react-router';
import { type DemoId, GestureLab, parseDemo } from './-gestures/lab/index.ts';

export const Route = createFileRoute('/gestures')({
  staticData: { chrome: 'bare' },
  validateSearch: (search: Record<string, unknown>): { demo: DemoId } => ({
    demo: parseDemo(search.demo),
  }),
  component: Gestures,
});

function Gestures() {
  const { demo } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <GestureLab
      demo={demo}
      onDemo={(next) =>
        void navigate({ search: { demo: next }, replace: true })
      }
    />
  );
}
