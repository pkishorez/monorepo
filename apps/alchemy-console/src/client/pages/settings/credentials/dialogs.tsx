import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@kestack/web-platform/components/alert-dialog';
import { Button } from '@kestack/web-platform/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@kestack/web-platform/components/dialog';
import {
  Field,
  FieldError,
  FieldLabel,
} from '@kestack/web-platform/components/field';
import { Input } from '@kestack/web-platform/components/input';
import { Spinner } from '@kestack/web-platform/components/spinner';
import type { CredentialSummary } from '../../../../shared/contracts/credential/index.ts';

/*
 * The two edits a credential has: a new name, and removal, each asked in a
 * dialog that stays filled in while it closes.
 */

interface EditProps {
  readonly open: boolean;
  /** The credential being edited, kept while the dialog closes. */
  readonly credential: CredentialSummary | null;
  readonly busy: boolean;
  readonly problem: string | null;
  readonly onClose: () => void;
}

export function RenameDialog({
  open,
  credential,
  busy,
  problem,
  onClose,
  onRename,
}: EditProps & { readonly onRename: (name: string) => void }) {
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            onRename(
              String(new FormData(event.currentTarget).get('name') ?? ''),
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>Rename credential</DialogTitle>
            <DialogDescription>
              Projects that deploy with it keep using it.
            </DialogDescription>
          </DialogHeader>
          <Field data-invalid={problem !== null || undefined}>
            <FieldLabel htmlFor="rename-credential">Name</FieldLabel>
            <Input
              id="rename-credential"
              name="name"
              key={credential?.credentialId}
              defaultValue={credential?.name ?? ''}
              autoComplete="off"
              maxLength={64}
              aria-invalid={problem !== null || undefined}
              aria-describedby={
                problem !== null ? 'rename-credential-error' : undefined
              }
            />
            {problem !== null && (
              <FieldError id="rename-credential-error">{problem}</FieldError>
            )}
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Spinner aria-hidden />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RemoveDialog({
  open,
  credential,
  busy,
  problem,
  onClose,
  onRemove,
}: EditProps & { readonly onRemove: () => void }) {
  const provider = credential?.provider === 'aws' ? 'AWS' : 'Cloudflare';
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove “{credential?.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            Console erases its keys. They still work at {provider}: revoke them
            there if nothing else uses them.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {problem !== null && (
          <p role="alert" className="text-sm text-destructive">
            {problem}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button variant="destructive" disabled={busy} onClick={onRemove}>
            {busy && <Spinner aria-hidden />}
            Remove
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
