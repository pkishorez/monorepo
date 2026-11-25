import type { ReactNode } from 'react';
import type { ViewPropsOf } from '@kestack/kabuki/react/types';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { tabsOf } from '../logic/shared/index.ts';
import type { InspectorShape } from '../logic/shared/index.ts';

type BodyProps = ViewPropsOf<typeof InspectorShape> & {
  readonly running: ReactNode;
  readonly blueprint: ReactNode;
  readonly world: ReactNode;
};

export function Body(self: BodyProps) {
  const { _tag, model, send, running, blueprint, world } = self;
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {!model.presenting && (
        <div
          role="tablist"
          aria-label="What the Inspector shows"
          className="flex h-10 shrink-0 items-center gap-1 border-b border-border/60 px-3"
        >
          {tabsOf(self).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={_tag === tab}
              onClick={() => send({ _tag: 'Viewed', tab })}
              className={cn(
                'relative flex h-10 items-center px-2 text-sm transition-colors after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-foreground after:opacity-0 after:transition-opacity',
                _tag === tab
                  ? 'font-medium text-foreground after:opacity-100'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tab}
            </button>
          ))}
        </div>
      )}
      <div role="tabpanel" className="relative flex min-h-0 flex-1 flex-col">
        {running}
        {blueprint}
        {world}
      </div>
    </div>
  );
}
