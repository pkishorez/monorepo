import type { ReactNode } from 'react';
import { Layer } from 'effect';
import { toReact } from '@kestack/kabuki/react';
import { LockIcon } from 'lucide-react';
import { DevtoolsDock } from '@kestack/web-platform/recipes/devtools';
import { KabukiDevtools } from '@kestack/web-platform/recipes/devtools';
import { TodosLive } from './story.ts';
import { TodosView } from './views.tsx';

const Demo = toReact(TodosLive, TodosView, Layer.empty, { name: 'todos-demo' });

/**
 * A to-do list, the smallest Kabuki app worth opening: two Actors, a filter
 * held as a State, and a to-do per Actor. How it works inside is in the
 * devtools beside it: the button in the corner, or Ctrl+/.
 */
export function Todos({
  actions,
}: {
  /** What sits at the end of the header, such as the site's theme toggle. */
  readonly actions?: ReactNode;
}) {
  const runtime = Demo.useRuntime();
  const { shown } = runtime;
  return (
    <DevtoolsDock
      storageKey="todos-demo:devtools"
      status={
        shown !== null && (
          <span
            title="Showing a past Step"
            className="block size-2 rounded-full bg-amber-500 ring-2 ring-background"
          >
            <span className="sr-only">Showing a past Step</span>
          </span>
        )
      }
      devtools={(layout) => (
        <KabukiDevtools runtime={runtime} overlay={layout === 'full'} />
      )}
    >
      <main className="flex h-full flex-col overflow-hidden bg-muted/30">
        <header className="flex h-16 shrink-0 items-center gap-6 px-6 max-sm:h-12 max-sm:px-4">
          <div className="flex min-w-0 flex-1 items-baseline gap-3">
            <h1 className="text-sm font-medium">To-dos</h1>
            <p className="hidden truncate text-[13px] text-muted-foreground lg:block">
              A Kabuki app. Open the devtools to see inside it.
            </p>
          </div>
          {actions}
        </header>
        <div className="flex min-h-0 flex-1 items-center justify-center px-6 pb-20 max-sm:p-0">
          <div className="flex h-full max-h-[820px] w-full max-w-[1080px] flex-col overflow-hidden bg-background sm:rounded-2xl sm:border sm:border-border sm:shadow-[0_1px_2px_rgb(0_0_0/0.04),0_12px_40px_-12px_rgb(0_0_0/0.18)]">
            <div className="flex h-11 shrink-0 items-center gap-3 border-b border-border bg-muted/40 px-3 max-sm:hidden">
              <div className="flex gap-1.5" aria-hidden>
                <span className="size-2.5 rounded-full bg-foreground/15" />
                <span className="size-2.5 rounded-full bg-foreground/15" />
                <span className="size-2.5 rounded-full bg-foreground/15" />
              </div>
              <div className="mx-auto flex h-7 w-full max-w-sm items-center gap-2 rounded-lg bg-background px-2.5 text-xs text-muted-foreground">
                <LockIcon className="size-3 shrink-0" />
                todos.app
              </div>
              <div className="w-[42px]" aria-hidden />
            </div>
            <div
              className={`min-h-0 flex-1 overflow-auto ${shown !== null ? 'pointer-events-none' : ''}`}
              inert={shown !== null}
            >
              <Demo />
            </div>
          </div>
        </div>
      </main>
    </DevtoolsDock>
  );
}
