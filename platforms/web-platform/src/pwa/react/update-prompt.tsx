import { createToastManager, Toaster } from '#components/ui/toast';
import { type ReactNode, useState } from 'react';
import { usePwa } from './react.js';
import { useUpdateToast } from './update-toast.js';

/**
 * Persistent toast while an update is ready; accepting applies it.
 * Renders its own toast viewport, so it does not need the app's `Toaster`.
 */
export const UpdatePrompt = (props: {
  readonly message?: string;
  readonly acceptLabel?: string;
}): ReactNode => {
  const { status, applyUpdate } = usePwa();
  const [manager] = useState(createToastManager);
  useUpdateToast(
    manager,
    status,
    {
      message: props.message ?? 'A new version is available.',
      acceptLabel: props.acceptLabel ?? 'Reload',
    },
    applyUpdate,
  );
  return <Toaster toastManager={manager} />;
};
