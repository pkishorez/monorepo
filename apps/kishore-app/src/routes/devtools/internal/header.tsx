import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Button } from '@monorepo/frontend/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@monorepo/frontend/components/ui/dialog';
import { Input } from '@monorepo/frontend/components/ui/input';
import { Label } from '@monorepo/frontend/components/ui/label';
import { Kbd } from '@monorepo/frontend/components/ui/kbd';
import {
  ActivityIcon,
  ArrowLeftIcon,
  ChevronsUpDownIcon,
  FolderIcon,
  NetworkIcon,
  RotateCwIcon,
  ServerIcon,
} from '@monorepo/frontend/lucide';
import { cn } from '@monorepo/frontend/utils';
import { CommandHint } from './command-hint';
import { type DevtoolsTool, isValidBaseUrl, useDevtoolsStore } from './store';
import { useActiveTool } from './use-active-tool';

/**
 * The DevTools chrome toolbar: a "DevTools" home button, the tool switch, a
 * center slot (the project switcher, depcruise only), a right-side actions slot,
 * and the always-present connection button.
 */
export function DevtoolsHeader({
  onHome,
  center,
  actions,
}: {
  onHome: () => void;
  center?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex items-center gap-4 border-b border-border/60 bg-background/80 px-4 py-2 backdrop-blur supports-backdrop-filter:bg-background/60">
      <button
        type="button"
        onClick={onHome}
        className="flex shrink-0 items-center gap-1.5 rounded-md px-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <ArrowLeftIcon className="size-4" />
        Home
      </button>

      <ToolSwitch />

      <div className="flex flex-1 items-center justify-center">{center}</div>

      <div className="flex shrink-0 items-center gap-1">
        {actions}
        <ConnectionButton />
      </div>
    </header>
  );
}

const TOOLS: ReadonlyArray<{
  id: DevtoolsTool;
  label: string;
  icon: typeof ActivityIcon;
}> = [
  { id: 'otel', label: 'otel', icon: ActivityIcon },
  { id: 'depcruise', label: 'depcruise', icon: NetworkIcon },
];

/** Segmented control selecting the active DevTools tool. */
export function ToolSwitch() {
  const [activeTool, setActiveTool] = useActiveTool();

  return (
    <div className="flex shrink-0 items-center gap-0.5 rounded-md border border-border/60 bg-muted/40 p-0.5">
      {TOOLS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => setActiveTool(id)}
          className={cn(
            'flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
            activeTool === id
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Icon className="size-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * Always-present connection control: shows the active DevTools server URL and
 * opens a dialog whose only job is to (re)configure that URL.
 */
export function ConnectionButton() {
  const devUrl = useDevtoolsStore((s) => s.devUrl);
  const setDevUrl = useDevtoolsStore((s) => s.setDevUrl);
  const open = useDevtoolsStore((s) => s.connectionOpen);
  const setOpen = useDevtoolsStore((s) => s.setConnectionOpen);

  const [draft, setDraft] = useState(devUrl);

  // Re-seed the draft from the current URL whenever the dialog opens (it can be
  // opened from here or from the "not configured" CTA).
  useEffect(() => {
    if (open) setDraft(devUrl);
  }, [open, devUrl]);

  const trimmed = draft.trim().replace(/\/+$/, '');
  const valid = isValidBaseUrl(trimmed);
  const dirty = trimmed !== devUrl;

  const save = () => {
    if (!valid) return;
    setDevUrl(trimmed);
    setOpen(false);
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        title={devUrl ? `Connection: ${devUrl}` : 'No connection configured'}
        aria-label="Configure connection"
        onClick={() => setOpen(true)}
        className="shrink-0 text-muted-foreground hover:text-foreground"
      >
        <ServerIcon className="size-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Connection</DialogTitle>
            <DialogDescription>
              Base URL of the DevTools server (no trailing <code>/rpc</code>).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="devtools-conn-url" className="sr-only">
              DevTools server URL
            </Label>
            <div className="flex gap-2">
              <Input
                id="devtools-conn-url"
                type="url"
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && valid) {
                    e.preventDefault();
                    save();
                  }
                }}
                placeholder="http://127.0.0.1:14400"
                aria-invalid={draft.length > 0 && !valid}
                className="font-mono text-sm"
              />
              <Button type="button" disabled={!valid || !dirty} onClick={save}>
                Save
              </Button>
            </div>
            {draft.length > 0 && !valid ? (
              <p className="text-xs text-destructive">
                Enter a valid http(s) URL.
              </p>
            ) : null}
          </div>
          <CommandHint />
        </DialogContent>
      </Dialog>
    </>
  );
}

/** The reload action shown in the depcruise toolbar. */
export function ReloadButton({
  onReload,
  canReload,
  isReloading,
}: {
  onReload: () => void;
  canReload: boolean;
  isReloading: boolean;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onReload}
      disabled={!canReload || isReloading}
      title={isReloading ? 'Reloading…' : 'Reload'}
      className="shrink-0 text-muted-foreground hover:text-foreground"
    >
      <RotateCwIcon className={cn('size-4', isReloading && 'animate-spin')} />
    </Button>
  );
}

/** The center command-style trigger that opens the project switcher. */
export function ProjectSwitcher({
  label,
  onClick,
}: {
  label: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex h-8 w-full max-w-md items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-3 text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
        label ? 'text-foreground' : 'text-muted-foreground',
      )}
    >
      <FolderIcon
        className={cn(
          'size-4 shrink-0',
          label ? 'text-primary' : 'text-muted-foreground',
        )}
      />
      <span className="min-w-0 flex-1 truncate text-left font-medium">
        {label ?? 'Select a project'}
      </span>
      <Hint>
        <ChevronsUpDownIcon className="size-3.5 text-muted-foreground opacity-70 transition-opacity group-hover:opacity-100" />
      </Hint>
    </button>
  );
}

/** Renders a subtle trailing affordance, kept on its own to ease future swaps. */
function Hint({ children }: { children: ReactNode }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <Kbd className="hidden bg-background/60 sm:inline-flex">⌘K</Kbd>
      {children}
    </span>
  );
}
