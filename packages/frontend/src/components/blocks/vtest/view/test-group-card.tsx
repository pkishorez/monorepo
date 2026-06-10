import { useState } from 'react';
import { ChevronRightIcon } from 'lucide-react';

import { HealthBadge } from '../health-badge';
import type { VtestGroup } from '../types';
import { GroupTestDialog } from './group-test-dialog';
import { groupHealth, StatusDot } from './status-dot';

interface TestGroupCardProps {
  group: VtestGroup;
}

/**
 * An inline test group rendered at a directive offset inside the prose. A thin
 * label row (group id, test count, roll-up health) sits above a flat,
 * borderless list of the documented tests — each a clickable row that opens the
 * group-scoped dialog focused on that test.
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
    <section className="not-prose my-8 border border-border bg-card/30">
      <header className="flex items-center justify-between gap-3 border-b border-border bg-muted/30 px-5 py-3">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <code className="truncate font-mono text-sm font-semibold tracking-tight text-foreground">
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
              className="group/test flex w-full items-start gap-3.5 px-5 py-3.5 text-left transition-colors hover:bg-muted/40"
            >
              <span className="mt-[0.4rem]">
                <StatusDot status={test.status} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[0.9375rem] leading-snug font-medium text-foreground transition-colors group-hover/test:text-primary">
                  {test.name}
                </span>
                {test.vdoc && (
                  <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                    {test.vdoc}
                  </span>
                )}
              </span>
              <ChevronRightIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground/40 transition-colors group-hover/test:text-foreground" />
            </button>
          </li>
        ))}
        {group.tests.length === 0 && (
          <li className="px-5 py-3.5 text-sm text-muted-foreground">
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
