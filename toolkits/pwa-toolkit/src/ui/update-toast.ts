import type { createToastManager } from 'kui-toolkit/components/ui/toast';
import { useEffect, useRef } from 'react';
import type { UpdateState } from '../client/index.js';

type ToastManager = ReturnType<typeof createToastManager>;

/**
 * Mirrors the update state into one persistent toast: shown while Available,
 * busy while Applying, gone otherwise. Closing it hides it until the next update.
 */
export const useUpdateToast = (
  manager: ToastManager,
  state: UpdateState,
  labels: { readonly message: string; readonly acceptLabel: string },
  apply: () => Promise<void>,
): void => {
  const id = useRef<string | null>(null);
  const closed = useRef(false);
  const latestApply = useRef(apply);
  latestApply.current = apply;

  useEffect(() => {
    const tag = state._tag;
    if (tag !== 'Available' && tag !== 'Applying') {
      const open = id.current;
      id.current = null;
      closed.current = false;
      if (open !== null) manager.close(open);
      return;
    }
    if (closed.current) return;
    const applying = tag === 'Applying';
    const options = {
      title: labels.message,
      type: applying ? 'loading' : undefined,
      timeout: 0,
      actionProps: {
        children: labels.acceptLabel,
        disabled: applying,
        onClick: () => void latestApply.current(),
      },
    };
    if (id.current === null) {
      id.current = manager.add({
        ...options,
        // Also fires for our own `close` above, after `id` is already cleared.
        onClose: () => {
          if (id.current === null) return;
          id.current = null;
          closed.current = true;
        },
      });
    } else {
      manager.update(id.current, options);
    }
  }, [manager, state._tag, labels.message, labels.acceptLabel]);
};
