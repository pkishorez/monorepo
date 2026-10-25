import type { ReactNode } from 'react';
import { Router } from '@kestack/kabuki/routing';
import { Notice, buttonClass } from '../../ui/index.ts';
import { Frame } from './frame.tsx';

/**
 * A page whose data is not there: loading, as one placeholder in the shape
 * the page will have, or failed with a way to try again.
 */
export function Unready({
  status,
  layout = 'task',
  children,
}: {
  status: { readonly _tag: 'Loading' } | { readonly _tag: 'Failed' };
  layout?: 'account' | 'task';
  /** The page's placeholder, sized like what it will show. */
  children: ReactNode;
}) {
  return (
    <Frame data={null} layout={layout}>
      {status._tag === 'Failed' ? (
        <Notice>
          <p>This page didn't load. Check your connection, then try again.</p>
          <Router.Retry
            className={buttonClass('ghost', 'sm', '-ml-3 mt-1 text-danger')}
          >
            Try again
          </Router.Retry>
        </Notice>
      ) : (
        <div aria-busy="true">{children}</div>
      )}
    </Frame>
  );
}
