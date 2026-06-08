import { AlertTriangleIcon, XCircleIcon } from 'lucide-react';

import { ScrollArea } from '#components/ui/scroll-area';

import { HealthBadge } from '../health-badge';
import type { Diagnostic, VtestHealth } from '../types';
import type { OutlineHeading } from './markdown-outline';

interface OnThisPageProps {
  headings: readonly OutlineHeading[];
  health: VtestHealth;
  diagnostics: readonly Diagnostic[];
}

/** Right rail: heading outline, feature health badge, and a diagnostics list. */
export function OnThisPage({ headings, health, diagnostics }: OnThisPageProps) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 border-l border-border xl:block">
      <ScrollArea className="h-full">
        <div className="space-y-6 p-5">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Health
            </p>
            <HealthBadge health={health} />
          </div>

          {headings.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                On this page
              </p>
              <ul className="space-y-1 border-l border-border">
                {headings.map((h, i) => (
                  <li key={`${h.id}-${i}`}>
                    <a
                      href={`#${h.id}`}
                      className="-ml-px block border-l border-transparent py-0.5 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                      style={{ paddingLeft: `${(h.depth - 1) * 12 + 12}px` }}
                    >
                      {h.text}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {diagnostics.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Diagnostics
              </p>
              <ul className="space-y-2">
                {diagnostics.map((d, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-2 text-xs"
                  >
                    {d.level === 'error' ? (
                      <XCircleIcon className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                    ) : (
                      <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                    )}
                    <span className="text-foreground/80">{d.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}
