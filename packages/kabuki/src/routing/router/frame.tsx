import type { MouseEvent, ReactNode } from 'react';
import { MetadataWriter, RouterContext, SendsContext } from './context.tsx';
import type { Drawing, Sends } from './context.tsx';

/*
 * What the Router draws around the app: the context links and hooks read,
 * a catch for plain clicks on links, and, when an Adapter holds the URL,
 * the Metadata, worked out from the data of the pages drawn.
 */

export function Frame({
  sends,
  drawing,
  attached,
  root,
  onClick,
  children,
}: {
  /** What links read: the same object while the Router's View lives. */
  readonly sends: Sends;
  readonly drawing: Drawing;
  readonly attached: boolean;
  readonly root: object;
  readonly onClick: (event: MouseEvent) => void;
  readonly children: ReactNode;
}) {
  return (
    <SendsContext value={sends}>
      <RouterContext value={drawing}>
        {attached && <MetadataWriter metadata={drawing.metadata} />}
        <div {...root} style={{ display: 'contents' }} onClick={onClick}>
          {children}
        </div>
      </RouterContext>
    </SendsContext>
  );
}
