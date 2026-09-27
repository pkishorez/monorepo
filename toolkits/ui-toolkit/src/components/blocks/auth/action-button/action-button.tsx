import { useState, type ComponentProps, type ReactNode } from 'react';
import { toast } from 'sonner';

import { Button } from '#components/ui/button';
import { Spinner } from '#components/ui/spinner';
import { cn } from '#lib/utils';

export type Action = () => Promise<unknown>;

export function useAction(
  action: Action,
  onError: (message: string) => void = toast.error,
) {
  const [pending, setPending] = useState(false);
  const run = () => {
    if (pending) return;
    setPending(true);
    action()
      .catch((cause: unknown) =>
        onError(
          cause instanceof Error && cause.message
            ? cause.message
            : 'That did not work. Try again.',
        ),
      )
      .finally(() => setPending(false));
  };
  return { pending, run };
}

export function PendingContent({
  pending,
  children,
}: {
  pending: boolean;
  children: ReactNode;
}) {
  return (
    <>
      <span
        className={cn(
          'inline-flex items-center gap-1.5',
          pending && 'invisible',
        )}
      >
        {children}
      </span>
      {pending ? (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner />
        </span>
      ) : null}
    </>
  );
}

type ActionButtonProps = Omit<ComponentProps<typeof Button>, 'onClick'> & {
  action: Action;
};

export function ActionButton({
  action,
  children,
  className,
  disabled,
  ...props
}: ActionButtonProps) {
  const { pending, run } = useAction(action);
  return (
    <Button
      {...props}
      disabled={disabled || pending}
      aria-busy={pending}
      className={cn('relative', className)}
      onClick={run}
    >
      <PendingContent pending={pending}>{children}</PendingContent>
    </Button>
  );
}
