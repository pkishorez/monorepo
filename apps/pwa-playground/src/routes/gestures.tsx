import { createFileRoute } from '@tanstack/react-router';
import { type DemoId, GestureLab, parseDemo } from './-gestures/lab/index.ts';

type GestureSearch = { readonly demo: DemoId; readonly debug?: false };

export const Route = createFileRoute('/gestures')({
  staticData: { chrome: 'bare' },
  validateSearch: (search: Record<string, unknown>): GestureSearch => ({
    demo: parseDemo(search.demo),
    ...(search.debug === false || search.debug === 'false'
      ? { debug: false as const }
      : {}),
  }),
  component: Gestures,
});

function Gestures() {
  const { demo, debug } = Route.useSearch();
  const navigate = Route.useNavigate();
  const search = (next: DemoId, showDebug: boolean): GestureSearch => ({
    demo: next,
    ...(showDebug ? {} : { debug: false }),
  });
  return (
    <GestureLab
      demo={demo}
      debug={debug !== false}
      onDemo={(next) =>
        void navigate({ search: search(next, debug !== false), replace: true })
      }
      onDebug={(next) =>
        void navigate({ search: search(demo, next), replace: true })
      }
    />
  );
}
