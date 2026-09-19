import { Eye, EyeOff } from 'lucide-react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { Button } from '#components/ui/button';
import { cn } from '#lib/utils';

interface EmailPrivacy {
  masked: boolean;
  toggle: () => void;
}

export const useEmailPrivacy = create<EmailPrivacy>()(
  persist(
    (set) => ({
      masked: false,
      toggle: () => set((state) => ({ masked: !state.masked })),
    }),
    { name: 'auth:mask-email' },
  ),
);

export function MaskedEmail({ email }: { email: string }) {
  const masked = useEmailPrivacy((state) => state.masked);
  return (
    <span
      aria-label={masked ? 'Email address hidden' : undefined}
      className={cn(
        'inline-block max-w-full truncate align-bottom',
        masked && 'select-none blur-xs',
      )}
    >
      {email}
    </span>
  );
}

export function EmailToggle() {
  const { masked, toggle } = useEmailPrivacy();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={masked ? 'Show email address' : 'Hide email address'}
      aria-pressed={masked}
      className="relative text-muted-foreground before:absolute before:-inset-1 hover:text-foreground"
      onClick={toggle}
    >
      {masked ? <EyeOff /> : <Eye />}
    </Button>
  );
}
