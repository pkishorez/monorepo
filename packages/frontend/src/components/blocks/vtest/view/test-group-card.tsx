import { useState } from 'react';
import { CodeIcon } from 'lucide-react';

import { HealthBadge } from '../health-badge';
import type { VtestGroup } from '../types';
import { GroupTestDialog } from './group-test-dialog';
import { groupHealth, StatusDot } from './status-dot';

interface TestGroupCardProps {
  group: VtestGroup;
}

/**
 * An inline test-group card rendered at a directive offset inside the prose. It
 * shows the group's roll-up health and each documented test with its
 * description and status dot. Clicking a test opens the group-scoped two-pane
 * dialog focused on that test.
 */
export function TestGroupCard({ group }: TestGroupCardProps) {
  const [active, setActive] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const health = groupHealth(group.tests.map((t) => t.status));

  const openTest = (name: string) => {
    setActive(name);
    setOpen(true);
  };

  return (
    <section className="not-prose my-7 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <CodeIcon className="size-4 shrink-0 text-muted-foreground" />
          <code className="truncate font-mono text-sm font-medium text-foreground">
            {group.id}
          </code>
          <span className="shrink-0 text-xs text-muted-foreground">
            {group.tests.length} test{group.tests.length === 1 ? '' : 's'}
          </span>
        </div>
        <HealthBadge health={health} />
      </header>

      <ul className="divide-y divide-border">
        {group.tests.map((test) => (
          <li key={test.name}>
            <button
              type="button"
              onClick={() => openTest(test.name)}
              className="flex w-full items-start gap-2.5 px-4 py-3 text-left transition-colors hover:bg-muted/40"
            >
              <span className="mt-1.5">
                <StatusDot status={test.status} />
              </span>
              <span className="min-w-0">
                <span className="block font-mono text-sm font-medium text-foreground">
                  {test.name}
                </span>
                {test.vdoc && (
                  <span className="mt-0.5 block text-sm text-muted-foreground">
                    {test.vdoc}
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
        {group.tests.length === 0 && (
          <li className="px-4 py-3 text-sm text-muted-foreground">
            No documented tests in this group.
          </li>
        )}
      </ul>

      <GroupTestDialog
        group={group}
        activeTest={active}
        open={open}
        onOpenChange={setOpen}
      />
    </section>
  );
}
