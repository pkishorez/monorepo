import { useRouter } from '@kestack/kabuki/routing';
import { router } from '../../shared/index.ts';
import type { Route } from '../../shared/index.ts';

/*
 * A thin bar across the top while the Router holds a move, up to 150 ms,
 * waiting on its data: the page shown stays until then.
 */

/** A thin bar across the top while the Router holds a move. */
export function Progress() {
  const { pending } = useRouter<Route>();
  return (
    <div
      data-testid="pending"
      data-pending={pending ? router.path(pending.to) : undefined}
      aria-hidden
      className={`fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-primary transition-[transform,opacity] ${
        pending
          ? 'scale-x-75 opacity-100 duration-[2s] ease-out'
          : 'scale-x-100 opacity-0 duration-200'
      }`}
    />
  );
}
