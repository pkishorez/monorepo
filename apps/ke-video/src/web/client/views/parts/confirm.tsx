import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@kestack/web-platform/ui/components/alert-dialog';
import { Button } from '@kestack/web-platform/ui/components/button';

/** Asks before a Video's folder goes: its short video, transcripts, summary and original. */
export function ConfirmDelete({
  name,
  open,
  onCancel,
  onDelete,
}: {
  /** The title, or the id while it has none. */
  readonly name: string | null;
  readonly open: boolean;
  readonly onCancel: () => void;
  readonly onDelete: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Its folder goes: the short video, the transcripts, the summary and
            the downloaded original. A running one is stopped first.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="h-11 sm:pointer-fine:h-9">
            Keep it
          </AlertDialogCancel>
          <Button
            variant="destructive"
            className="h-11 sm:pointer-fine:h-9"
            onClick={onDelete}
          >
            Delete
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
