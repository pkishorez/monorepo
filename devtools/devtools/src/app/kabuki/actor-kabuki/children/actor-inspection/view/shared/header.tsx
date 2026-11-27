import { PlusIcon, RotateCcwIcon, Trash2Icon } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@kestack/web-platform/ui/components/alert-dialog';
import { Button } from '@kestack/web-platform/ui/components/button';
import {
  NativeSelect,
  NativeSelectOption,
} from '@kestack/web-platform/ui/components/native-select';
import type { Clearing, Project } from '../../logic/shared/index.js';

function ClearThreads({
  noun,
  worktree,
  clearing,
  empty,
  onAsk,
  onDismiss,
  onConfirm,
}: {
  readonly noun: string;
  readonly worktree: string;
  readonly clearing: Clearing;
  readonly empty: boolean;
  readonly onAsk: () => void;
  readonly onDismiss: () => void;
  readonly onConfirm: () => void;
}) {
  const busy = clearing._tag === 'Clearing';
  return (
    <AlertDialog
      open={clearing._tag !== 'Kept'}
      onOpenChange={(open) => (open ? onAsk() : onDismiss())}
    >
      <AlertDialogTrigger
        aria-label={`Clear ${noun}`}
        title={`Clear ${noun}`}
        disabled={empty}
        render={
          <Button size="icon-sm" variant="ghost">
            <Trash2Icon aria-hidden className="size-3.5" />
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Clear {noun}?</AlertDialogTitle>
          <AlertDialogDescription>
            This deletes all the {noun} DevTools keeps for{' '}
            <span className="font-mono">{worktree}</span>, and stops any still
            answering. It cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {clearing._tag === 'Confirming' && clearing.problem !== null && (
          <p className="text-sm text-pretty text-destructive">
            {clearing.problem}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? 'Clearing…' : 'Clear'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function Header({
  projects,
  project,
  worktrees,
  folder,
  worktreesProblem,
  threads,
  thread,
  worktree,
  noun,
  clearing,
  onProject,
  onWorktree,
  onRetryWorktrees,
  onThread,
  onClearAsk,
  onClearDismiss,
  onClearConfirm,
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
  readonly worktree: string;
  readonly noun: string;
  readonly clearing: Clearing;
  readonly onProject: (path: string) => void;
  readonly onWorktree: (folder: string) => void;
  readonly onRetryWorktrees: () => void;
  readonly onThread: (thread: string | null) => void;
  readonly onClearAsk: () => void;
  readonly onClearDismiss: () => void;
  readonly onClearConfirm: () => void;
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
        <ClearThreads
          noun={noun}
          worktree={worktree}
          clearing={clearing}
          empty={threads.length === 0}
          onAsk={onClearAsk}
          onDismiss={onClearDismiss}
          onConfirm={onClearConfirm}
        />
      </div>
    </div>
  );
}
