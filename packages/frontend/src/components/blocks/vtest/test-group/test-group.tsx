import { useState } from 'react';

import { FlaskConicalIcon, PlayIcon } from 'lucide-react';

import { Badge } from '#components/ui/badge';
import { Button } from '#components/ui/button';

import type { TestStatus, VtestTest } from '../types';
import { StatusBadge } from './status-badge';
import { TestDialog } from './test-dialog';

interface TestGroupProps {
  /** Group id (matches the `::test-group{id=…}` directive). */
  groupId: string;
  /** Static list of documented tests in the group. */
  tests: readonly VtestTest[];
  /** Live roll-up run status of the group (`pending` reads as "Queued"). */
  status?: TestStatus;
  /** Run this whole group. */
  onRun?: () => void;
  /** Live status for a given test name, used in the dialog. */
  testStatus?: (name: string) => TestStatus | undefined;
  /** Run a single test by name, used in the dialog. */
  onRunTest?: (name: string) => void;
}

/**
 * Live test group rendered where a `::test-group` directive appears in a
 * feature's markdown. Shows the group id, a count, a live status badge and a
 * run button; clicking the row opens a dialog listing every test with its vdoc,
 * a per-test status badge, and a per-test run button. Purely prop-driven — the
 * route owns the stream and supplies status + run callbacks.
 */
export function TestGroup({
  groupId,
  tests,
  status,
  onRun,
  testStatus,
  onRunTest,
}: TestGroupProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border px-4 py-3">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <FlaskConicalIcon className="size-4 text-muted-foreground" />
        <span className="font-mono text-sm">{groupId}</span>
        <Badge variant="outline">
          {tests.length} test{tests.length !== 1 ? 's' : ''}
        </Badge>
      </button>

      <StatusBadge status={status} />

      {onRun && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Run ${groupId}`}
          disabled={status === 'running' || status === 'pending'}
          onClick={onRun}
        >
          <PlayIcon className="size-4" />
        </Button>
      )}

      <TestDialog
        groupId={groupId}
        tests={tests}
        open={open}
        onOpenChange={setOpen}
        testStatus={testStatus}
        onRunTest={onRunTest}
      />
    </div>
  );
}
