import type { ReactNode } from 'react';
import type { ViewPropsOf } from '@kestack/kabuki/react/types';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { tabOf } from '../logic/shared/index.js';
import type { InspectionShape } from '../logic/shared/index.js';

type BodyProps = ViewPropsOf<typeof InspectionShape> & {
  readonly inspector: ReactNode;
  readonly sidebar: ReactNode;
  readonly story: ReactNode;
};

const PANEL = 'relative min-h-0 flex-1 flex-col';

export function Body({ inspector, sidebar, story, ...self }: BodyProps) {
  const tab = tabOf(self);
  return (
    <div className="@container relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground">
      <div
        className={cn(
          PANEL,
          'md:flex-row',
          tab === 'inspector' ? 'flex' : 'hidden',
        )}
      >
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {inspector}
        </div>
        {sidebar}
      </div>
      <div className={cn(PANEL, tab === 'story' ? 'flex' : 'hidden')}>
        {story}
      </div>
    </div>
  );
}
