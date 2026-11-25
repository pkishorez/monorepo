import type { ReactNode } from 'react';
import type { ViewPropsOf } from '@kestack/kabuki/react/types';
import type { RemoteInspectorShape } from '../logic/shared/index.js';

type BodyProps = ViewPropsOf<typeof RemoteInspectorShape> & {
  readonly inspector: ReactNode;
};

export function Body({ inspector }: BodyProps) {
  return (
    <div className="@container relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground">
      {inspector}
    </div>
  );
}
