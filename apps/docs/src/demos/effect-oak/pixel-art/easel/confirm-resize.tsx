import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@kstackz/web-platform/components/alert-dialog';

/** Asks before a new size throws the picture away. */
export const ConfirmResize = ({
  size,
  onConfirm,
  onCancel,
}: {
  readonly size: number | null;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) => (
  <AlertDialog
    open={size !== null}
    onOpenChange={(open) => {
      if (!open) onCancel();
    }}
  >
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Change grid size?</AlertDialogTitle>
        <AlertDialogDescription>
          Changing to {size}×{size} clears the canvas and its history.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction onClick={onConfirm}>Change size</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
