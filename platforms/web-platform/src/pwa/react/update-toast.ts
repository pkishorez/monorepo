import type { createToastManager } from '#components/ui/toast';
import { useEffect, useRef } from 'react';
import type { PwaStatus } from '../client/index.js';

type ToastManager = ReturnType<typeof createToastManager>;

/**
 * Mirrors the status into one persistent toast: shown while UpdateReady,
 * busy while Updating, gone otherwise. Closing it hides it until the next update.
 */
export const useUpdateToast = (
  manager: ToastManager,
  status: PwaStatus,
  labels: { readonly message: string; readonly acceptLabel: string },
  apply: () => Promise<void>,
): void => {
  const id = useRef<string | null>(null);
  const closed = useRef(false);
  const latestApply = useRef(apply);
  latestApply.current = apply;

  useEffect(() => {
    const tag = status._tag;
    if (tag !== 'UpdateReady' && tag !== 'Updating') {
      const open = id.current;
      id.current = null;
      closed.current = false;
      if (open !== null) manager.close(open);
      return;
    }
    if (closed.current) return;
    const applying = tag === 'Updating';
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
  }, [manager, status._tag, labels.message, labels.acceptLabel]);
};
