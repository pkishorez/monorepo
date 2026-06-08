import { PlayIcon } from 'lucide-react';

import { Button } from '#components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';

import { RevealMore } from '../reveal';
import type { TestStatus, VtestTest } from '../types';
import { StatusBadge } from './status-badge';

interface TestDialogProps {
  /** Group id, shown as the dialog title. */
  groupId: string;
  /** Documented tests in the group, listed with their vdoc captions. */
  tests: readonly VtestTest[];
  /** Whether the dialog is open. */
  open: boolean;
  /** Open/close handler. */
  onOpenChange: (open: boolean) => void;
  /** Live status for a given test name, if known. */
  testStatus?: (name: string) => TestStatus | undefined;
  /** Run a single test by name. */
  onRunTest?: (name: string) => void;
}

/**
 * Dialog listing every documented test in a group with its vdoc caption, a live
 * per-test status badge, and a per-test run button. Long lists reveal
 * progressively to keep the surface calm.
 */
export function TestDialog({
  groupId,
  tests,
  open,
  onOpenChange,
  testStatus,
  onRunTest,
}: TestDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-mono text-base">{groupId}</DialogTitle>
          <DialogDescription>
            {tests.length} documented test{tests.length !== 1 ? 's' : ''}
          </DialogDescription>
        </DialogHeader>

        <RevealMore items={tests} itemKey={(t) => t.name}>
          {(test) => (
            <div className="flex items-start gap-3 rounded-lg border border-border px-4 py-3">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm">{test.name}</span>
                {test.vdoc && (
                  <span className="text-xs text-muted-foreground">
                    {test.vdoc}
                  </span>
                )}
              </div>
              <StatusBadge status={testStatus?.(test.name)} />
              {onRunTest && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Run ${test.name}`}
                  onClick={() => onRunTest(test.name)}
                >
                  <PlayIcon className="size-4" />
                </Button>
              )}
            </div>
          )}
        </RevealMore>
      </DialogContent>
    </Dialog>
  );
}
