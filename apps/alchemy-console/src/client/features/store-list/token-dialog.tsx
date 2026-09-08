import { Button } from 'kui-toolkit/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from 'kui-toolkit/components/ui/dialog';
import {
  adminPermissions,
  cloudflareTokenUrl,
} from './cloudflare-token-url.ts';

export function TokenDialog({
  accountId,
  access,
  onAccess,
  onClose,
}: {
  accountId: string;
  access: 'view' | 'admin';
  onAccess: (access: 'view' | 'admin') => void;
  onClose: () => void;
}) {
  const url = cloudflareTokenUrl(accountId, access);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Cloudflare token</DialogTitle>
          <DialogDescription>
            Choose what this connection can do in the console.
          </DialogDescription>
        </DialogHeader>
        <fieldset className="space-y-3">
          <legend className="sr-only">Console access</legend>
          {(['view', 'admin'] as const).map((value) => (
            <label
              key={value}
              className="flex cursor-pointer items-start gap-3 rounded-lg border p-4"
            >
              <input
                type="radio"
                name="token-access"
                checked={access === value}
                onChange={() => onAccess(value)}
                className="mt-1"
              />
              <span>
                <span className="block font-medium">
                  {value === 'view' ? 'View only' : 'Admin'}
                </span>
                <span className="text-sm text-muted-foreground">
                  {value === 'view'
                    ? 'Browse stacks, stages, and resources.'
                    : 'Browse state and destroy stages.'}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
        <p className="text-sm text-muted-foreground">
          {access === 'view'
            ? 'Discovery requires Workers Scripts Edit and Secrets Store Edit in Cloudflare. View-only restrictions are enforced by this console.'
            : 'All permissions in this preset are selected. Cloudflare permissions also cover production resources: the console separately blocks production deletion. Review or remove permissions and narrow the zone scope in Cloudflare before creating the token.'}
        </p>
        {access === 'admin' && (
          <details>
            <summary className="cursor-pointer text-sm font-medium">
              Included permissions ({adminPermissions.length})
            </summary>
            <ul className="mt-3 grid gap-1 text-sm text-muted-foreground">
              {adminPermissions.map(([key, label, type]) => (
                <li key={key}>
                  {label} — {type}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-muted-foreground">
              Additional Cloudflare products may require permissions outside
              this template. You can add them in Cloudflare.
            </p>
          </details>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Done
          </Button>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              Create token in Cloudflare ↗
            </a>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
