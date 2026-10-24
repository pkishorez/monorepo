import { CircleAlertIcon } from '@kestack/web-platform/ui/components/lucide';

/** One short line beside where a write was refused. */
export function Refusal({ reason }: { readonly reason: string | null }) {
  if (reason === null) return null;
  return (
    <p
      role="alert"
      className="flex items-center gap-1.5 text-sm text-destructive"
    >
      <CircleAlertIcon aria-hidden className="size-3.5 shrink-0" />
      {reason} — undone.
    </p>
  );
}
