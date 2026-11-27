import { FolderIcon, RotateCcwIcon } from 'lucide-react';
import { Button } from '@kestack/web-platform/ui/components/button';
import type { Project } from '../logic/shared/index.js';

export function ProjectChoice({
  app,
  projects,
  problem,
  onChoose,
  onRetry,
}: {
  readonly app: string;
  readonly projects: ReadonlyArray<Project> | null;
  readonly problem: string | null;
  readonly onChoose: (path: string) => void;
  readonly onRetry: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 overflow-auto">
      <div className="m-auto flex w-full max-w-sm flex-col px-6 py-10">
        <h2 className="text-sm font-medium text-foreground">
          Which Project is {app} in?
        </h2>
        <p className="mt-1.5 text-sm text-pretty text-muted-foreground">
          Story asks the Agent about this app's code, so it needs to know where
          it is. Pick one of your Projects, then its Worktree beside the chat;
          DevTools remembers both for {app}.
        </p>
        {problem !== null ? (
          <div className="mt-5 flex flex-col items-start gap-2">
            <p className="text-sm text-pretty text-foreground">{problem}</p>
            <Button size="sm" variant="outline" onClick={onRetry}>
              <RotateCcwIcon aria-hidden className="size-3.5" />
              Try again
            </Button>
          </div>
        ) : projects === null ? (
          <p
            role="status"
            className="mt-5 flex items-center gap-2 text-sm text-muted-foreground"
          >
            <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground/60 motion-reduce:animate-none" />
            Reading your Projects…
          </p>
        ) : projects.length === 0 ? (
          <p className="mt-5 text-sm text-pretty text-muted-foreground">
            You have no Projects yet. Add this app's folder in Monoverse, then
            come back here.
          </p>
        ) : (
          <ul className="mt-5 flex flex-col gap-px">
            {projects.map(({ name, path }) => (
              <li key={path}>
                <button
                  type="button"
                  onClick={() => onChoose(path)}
                  className="group flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors duration-150 outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring active:bg-muted motion-reduce:transition-none"
                >
                  <FolderIcon
                    aria-hidden
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium text-foreground">
                      {name}
                    </span>
                    <span className="truncate font-mono text-[11px] text-muted-foreground">
                      {path}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
