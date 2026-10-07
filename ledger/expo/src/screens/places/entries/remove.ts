import { toast } from '@kstackz/expo-platform/components/toast';
import { useWrites } from '@ledger/core/app/session';
import type { Entry } from '@ledger/core/model';

/**
 * Deletes an Entry at once, with a toast to bring it back, as on the web.
 * `onRestore` hears it come back, to mark it again.
 */
export const useRemoveEntry = (onRestore?: (entry: Entry) => void) => {
  const { removeEntry, restoreEntry } = useWrites();
  return (entry: Entry) => {
    removeEntry(entry.id);
    toast.show({
      placement: 'top',
      label: `Deleted ${entry.memo || 'the entry'}`,
      actionLabel: 'Undo',
      onActionPress: (handle) => {
        handle.hide();
        restoreEntry(entry);
        onRestore?.(entry);
      },
    });
  };
};
