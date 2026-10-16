import type { MouseEvent, ReactNode } from 'react';
import { MetadataWriter, RouterContext } from './context.tsx';
import type { Drawing } from './context.tsx';

/*
 * What the Router draws around the app: the context links and hooks read,
 * a catch for plain clicks on links, and, when an Adapter holds the address,
 * the Metadata, worked out from the data of the pages drawn.
 */

export function Frame({
  drawing,
  attached,
  root,
  onClick,
  children,
}: {
  readonly drawing: Drawing;
  readonly attached: boolean;
  readonly root: object;
  readonly onClick: (event: MouseEvent) => void;
  readonly children: ReactNode;
}) {
  return (
    <RouterContext value={drawing}>
      {attached && <MetadataWriter metadata={drawing.metadata} />}
      <div {...root} style={{ display: 'contents' }} onClick={onClick}>
        {children}
      </div>
    </RouterContext>
  );
}
