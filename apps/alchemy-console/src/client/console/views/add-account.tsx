import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@kestack/web-platform/components/dialog';
import { LocalForm } from './local-form.tsx';

/** Local mode's Add account: who to sign in as, asked in a dialog. */
export function AddAccountDialog({
  open,
  busy,
  onSignIn,
  onClose,
}: {
  readonly open: boolean;
  readonly busy: boolean;
  readonly onSignIn: (email: string, name: string | null) => void;
  readonly onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add an account</DialogTitle>
          <DialogDescription>
            It becomes the active account; switch back from the Account menu.
          </DialogDescription>
        </DialogHeader>
        <LocalForm busy={busy} submit="Add account" onSignIn={onSignIn} />
      </DialogContent>
    </Dialog>
  );
}
