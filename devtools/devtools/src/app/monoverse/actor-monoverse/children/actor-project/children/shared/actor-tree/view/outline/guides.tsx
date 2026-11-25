import { memo } from 'react';
import { cn } from '@kestack/web-platform/ui/components/utils';

import type { Guide } from './layout.js';

export const OutlineGuides = memo(function OutlineGuides({
  guides,
  current,
}: {
  guides: ReadonlyArray<Guide>;
  current: string | null;
}) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {guides.map((guide) => (
        <span
          key={guide.folder}
          className={cn(
            'absolute w-px',
            guide.folder === current
              ? 'bg-foreground/25'
              : 'bg-foreground/[0.08]',
          )}
          style={{ left: guide.x, top: guide.top, height: guide.height }}
        />
      ))}
    </div>
  );
});
