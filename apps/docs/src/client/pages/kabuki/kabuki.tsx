import { View } from '@kestack/kabuki/react';
import { Pages } from '../../../shared/index.ts';
import { Sidebar, column } from '../../components/index.ts';
import { DemoView, StageDemoView, TodosDemoView } from './demo.tsx';
import { DocView } from './doc.tsx';
import { Landing } from './landing/landing.tsx';

/*
 * kabuki's place: the landing page when the URL ends here, or a docs page
 * with the sidebar beside it from the `lg` width, or a demo full screen,
 * which the root draws outside the site's layout.
 */

export const KabukiView = View.make(Pages.KabukiLive, (self) => {
  const {
    Doc: doc,
    Demo: demo,
    TodosDemo: todos,
    StageDemo: stage,
  } = self.children;
  if (demo) return <DemoView instance={demo} />;
  if (todos) return <TodosDemoView instance={todos} />;
  if (stage) return <StageDemoView instance={stage} />;
  if (!doc) return <Landing />;
  return (
    <div className={`${column} grid gap-10 lg:grid-cols-[15rem_minmax(0,1fr)]`}>
      <aside className="hidden lg:block">
        <div className="sticky top-14 h-[calc(100dvh-3.5rem)] overflow-y-auto overscroll-contain border-r border-border py-8 pr-6">
          <Sidebar />
        </div>
      </aside>
      <main className="min-w-0 py-8 lg:py-10">
        <DocView instance={doc} />
      </main>
    </div>
  );
});
