import { View } from '@kestack/kabuki/react';
import { useSyncExternalStore } from 'react';
import { Router } from '@kestack/kabuki/routing';
import { ArrowLeftIcon } from '@kestack/web-platform/components/lucide';
import { Pages, router } from '../../../shared/index.ts';
import { ThemeToggle } from '../../components/index.ts';
import {
  OpeningAnApp,
  OpeningAnAppStage,
} from '../../demos/opening-an-app/index.ts';
import { Todos, TodosStage } from '../../demos/todos/index.ts';

/** The end of a demo's header: the theme toggle and a way back to the docs. */
const actions = (
  <div className="-mr-2 flex shrink-0 items-center gap-1">
    <ThemeToggle />
    <Router.Link
      to={router.Kabuki.Doc({ slug: 'introduction' })}
      className="flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeftIcon className="size-3.5" />
      Docs
    </Router.Link>
  </div>
);

/** Opening an app, full screen, with a way back to the docs in its header. */
export const DemoView = View.make(Pages.DemoLive, () => (
  <div className="h-dvh">
    <OpeningAnApp actions={actions} />
  </div>
));

/** To-dos, full screen, with a way back to the docs in its header. */
export const TodosDemoView = View.make(Pages.TodosDemoLive, () => (
  <div className="h-dvh">
    <Todos actions={actions} />
  </div>
));

const onHash = (change: () => void) => {
  window.addEventListener('hashchange', change);
  return () => window.removeEventListener('hashchange', change);
};

/**
 * A demo staged to be watched, named by the URL's hash. The hash never
 * reaches a server, so the stage is drawn in the browser alone.
 */
export const StageDemoView = View.make(Pages.StageDemoLive, () => {
  const hash = useSyncExternalStore(
    onHash,
    () => window.location.hash,
    () => null,
  );
  if (hash === null) return <div className="h-dvh bg-background" />;
  return hash === '#opening-an-app' ? <OpeningAnAppStage /> : <TodosStage />;
});
