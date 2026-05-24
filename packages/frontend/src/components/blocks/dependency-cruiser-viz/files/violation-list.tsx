import { ChevronRightIcon } from 'lucide-react';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '#components/ui/collapsible';

import type { ViolationItem } from './file-tree-model';

export function ViolationList({ violations }: { violations: ViolationItem[] }) {
  if (violations.length === 0) return null;

  return (
    <Collapsible defaultOpen={violations.length <= 5}>
      <div className="border-b border-border px-4 py-3">
        <CollapsibleTrigger className="group flex w-full items-center gap-1.5 text-xs font-semibold text-red-500">
          <ChevronRightIcon className="size-3.5 transition-transform group-data-[panel-open]:rotate-90" />
          Violations ({violations.length})
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-2 flex flex-col gap-1.5">
            {violations.map((v, i) => (
              <div
                key={`${v.fromFile}-${v.toFile}-${i}`}
                className="flex flex-col gap-0.5 text-xs text-muted-foreground"
              >
                <span className="font-medium text-red-400">
                  {v.from} {'->'} {v.to}
                </span>
                <span className="font-mono text-[10px] opacity-70">
                  {v.fromFile} {'->'} {v.toFile}
                </span>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
