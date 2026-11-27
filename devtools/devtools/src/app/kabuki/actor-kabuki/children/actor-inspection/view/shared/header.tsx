import { PlusIcon, RotateCcwIcon } from 'lucide-react';
import { Button } from '@kestack/web-platform/ui/components/button';
import {
  NativeSelect,
  NativeSelectOption,
} from '@kestack/web-platform/ui/components/native-select';
import type { Project } from '../../logic/shared/index.js';

export function Header({
  projects,
  project,
  worktrees,
  folder,
  worktreesProblem,
  threads,
  thread,
  onProject,
  onWorktree,
  onRetryWorktrees,
  onThread,
}: {
  readonly projects: ReadonlyArray<Project>;
  readonly project: Project;
  readonly worktrees: ReadonlyArray<{
    readonly folder: string;
    readonly label: string;
  }>;
  readonly folder: string;
  readonly worktreesProblem: string | null;
  readonly threads: ReadonlyArray<{
    readonly id: string;
    readonly title: string;
  }>;
  readonly thread: string | null;
  readonly onProject: (path: string) => void;
  readonly onWorktree: (folder: string) => void;
  readonly onRetryWorktrees: () => void;
  readonly onThread: (thread: string | null) => void;
}) {
  return (
    <div className="flex shrink-0 flex-col gap-2 border-b border-border/50 p-3">
      <div className="grid grid-cols-2 gap-1.5">
        <NativeSelect
          size="sm"
          className="w-full min-w-0"
          aria-label="Project"
          title={project.path}
          value={project.path}
          onChange={(event) => onProject(event.target.value)}
        >
          {projects.map(({ name, path }) => (
            <NativeSelectOption key={path} value={path}>
              {name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect
          size="sm"
          className="w-full min-w-0"
          aria-label="Worktree"
          title={folder}
          value={folder}
          onChange={(event) => onWorktree(event.target.value)}
        >
          {worktrees.map(({ folder: one, label }) => (
            <NativeSelectOption key={one} value={one}>
              {label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      {worktreesProblem !== null && (
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 text-xs text-pretty text-muted-foreground">
            {worktreesProblem}
          </p>
          <Button size="xs" variant="outline" onClick={onRetryWorktrees}>
            <RotateCcwIcon aria-hidden className="size-3" />
            Try again
          </Button>
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <NativeSelect
          size="sm"
          className="min-w-0 flex-1"
          aria-label="Thread"
          value={thread ?? ''}
          onChange={(event) =>
            onThread(event.target.value === '' ? null : event.target.value)
          }
        >
          <NativeSelectOption value="">New thread</NativeSelectOption>
          {threads.map(({ id, title }) => (
            <NativeSelectOption key={id} value={id}>
              {title === '' ? 'Untitled' : title}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Button
          size="sm"
          variant="ghost"
          disabled={thread === null}
          onClick={() => onThread(null)}
          title="Start a new thread"
        >
          <PlusIcon aria-hidden className="size-3.5" />
          New
        </Button>
      </div>
    </div>
  );
}
