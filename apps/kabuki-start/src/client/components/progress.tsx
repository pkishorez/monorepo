import { usePending } from '@kestack/kabuki/routing';
import { Routes } from '../../shared/index.ts';
import type { Route } from '../../shared/index.ts';

/*
 * A thin bar across the top while a move waits on its Loaders: the page
 * shown stays until the next one has its Inputs.
 */

/** A thin bar across the top while the Router waits on a move's Loaders. */
export function Progress() {
  const pending = usePending<Route>();
  return (
    <div
      data-testid="pending"
      data-pending={pending ? Routes.path(pending.to) : undefined}
      aria-hidden
      className={`fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-primary transition-[transform,opacity] ${
        pending
          ? 'scale-x-75 opacity-100 duration-[2s] ease-out'
          : 'scale-x-100 opacity-0 duration-200'
      }`}
    />
  );
}
