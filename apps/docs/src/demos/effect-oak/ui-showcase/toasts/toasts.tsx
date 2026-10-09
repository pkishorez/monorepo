import { Effect, Schema } from 'effect';
import { X } from 'lucide-react';
import { cn } from '@kstackz/web-platform/components/utils';

/*
 * Toasts are data in the showcase's Model, not Nodes: they are a list that
 * grows and shrinks, and a Node cannot have one Child per row (blocker 1).
 * Foldkit's Toast is the same, a list inside one Submodel.
 *
 * Each toast that is not sticky expires after a Command's wait in the app's
 * Time. Dismissing one early cannot stop its timer (blocker 7), so the
 * expiry of a toast that is already gone is simply ignored.
 */

const EXPIRE_MS = 4000;

export const Variant = Schema.Literals(['Info', 'Success', 'Warning', 'Error']);
type Variant = typeof Variant.Type;

export const Toast = Schema.Struct({
  id: Schema.Number,
  variant: Variant,
  title: Schema.String,
  description: Schema.String,
  sticky: Schema.Boolean,
});
type Toast = typeof Toast.Type;

/** The sample toast for each button on the Toast page. */
export const SAMPLES = {
  Info: {
    title: 'Changes saved',
    description: 'Your preferences have been updated.',
  },
  Success: {
    title: 'Uploaded successfully',
    description: 'kit-manual.pdf is now available.',
  },
  Warning: {
    title: 'Storage almost full',
    description: 'You have used 90% of your space.',
  },
  Error: {
    title: 'Upload failed',
    description: 'The server did not answer. Try again.',
  },
} as const satisfies Record<Variant, { title: string; description: string }>;

/** A Command that expires the toast with this id after a while. */
export const expireLater = (id: number) =>
  Effect.sleep(EXPIRE_MS).pipe(
    Effect.as({ _tag: 'ExpiredToast' as const, id }),
  );

const TONE: Record<Variant, string> = {
  Info: 'border-l-sky-500',
  Success: 'border-l-green-500',
  Warning: 'border-l-amber-500',
  Error: 'border-l-red-500',
};

/** The toasts, stacked in the corner of the showcase. */
export const ToastStack = ({
  toasts,
  onDismiss,
}: {
  readonly toasts: ReadonlyArray<Toast>;
  readonly onDismiss: (id: number) => void;
}) => (
  <ol
    aria-live="polite"
    className="pointer-events-none absolute right-4 bottom-4 z-40 flex w-80 flex-col gap-2"
  >
    {toasts.map((toast) => (
      <li
        key={toast.id}
        role={toast.variant === 'Error' ? 'alert' : 'status'}
        className={cn(
          'pointer-events-auto flex items-start gap-3 rounded-md border border-l-4 bg-background p-3 shadow-md',
          TONE[toast.variant],
        )}
      >
        <div className="flex-1">
          <p className="text-sm font-medium">{toast.title}</p>
          <p className="text-xs text-muted-foreground">{toast.description}</p>
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          className="text-muted-foreground hover:text-foreground"
          onClick={() => onDismiss(toast.id)}
        >
          <X className="size-4" />
        </button>
      </li>
    ))}
  </ol>
);
