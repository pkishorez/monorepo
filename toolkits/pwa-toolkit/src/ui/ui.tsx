import { createToastManager, Toaster } from 'kui-toolkit/components/ui/toast';
import { type ReactNode, useState } from 'react';
import { usePwaUpdate } from '../react/index.js';
import { useUpdateToast } from './update-toast.js';

/**
 * Persistent toast while an update is Available; accepting applies it.
 * Renders its own toast viewport, so it does not need the app's `Toaster`.
 */
export const UpdatePrompt = (props: {
  readonly message?: string;
  readonly acceptLabel?: string;
}): ReactNode => {
  const { state, apply } = usePwaUpdate();
  const [manager] = useState(createToastManager);
  useUpdateToast(
    manager,
    state,
    {
      message: props.message ?? 'A new version is available.',
      acceptLabel: props.acceptLabel ?? 'Reload',
    },
    apply,
  );
  return <Toaster toastManager={manager} />;
};
