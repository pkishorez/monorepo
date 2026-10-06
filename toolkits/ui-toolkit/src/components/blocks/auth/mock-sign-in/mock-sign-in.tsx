import { useId, useState, type FormEvent } from 'react';

import { Avatar, AvatarFallback } from '#components/ui/avatar';
import { Button } from '#components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import { cn } from '#lib/utils';

import { MaskedEmail } from '../email-privacy';

/** Who to sign in as, when sign-in is mocked. */
export interface MockSignInChoice {
  email: string;
  name?: string;
}

export interface MockSignInProps {
  open: boolean;
  presets: ReadonlyArray<MockSignInChoice>;
  onChoose: (choice: MockSignInChoice) => void;
  /** Called when the User closes the dialog without choosing. */
  onCancel: () => void;
}

const initials = (choice: MockSignInChoice) =>
  (choice.name || choice.email)
    .split(/[\s@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

function PresetButton({
  choice,
  onChoose,
}: {
  choice: MockSignInChoice;
  onChoose: (choice: MockSignInChoice) => void;
}) {
  return (
    <Button
      variant="ghost"
      className="h-auto w-full justify-start gap-3 px-2 py-2 text-left font-normal"
      onClick={() => onChoose(choice)}
    >
      <Avatar className="size-7 text-[0.6rem]">
        <AvatarFallback>{initials(choice)}</AvatarFallback>
      </Avatar>
      <span className="flex min-w-0 flex-1 flex-col">
        {choice.name ? (
          <span className="truncate text-sm">{choice.name}</span>
        ) : null}
        <span
          className={cn(
            'truncate',
            choice.name ? 'text-xs text-muted-foreground' : 'text-sm',
          )}
        >
          <MaskedEmail email={choice.email} />
        </span>
      </span>
    </Button>
  );
}

/** Stands in for a real sign-in during demos and local development: the
 * User picks a preset or types who they want to be. */
export function MockSignIn({
  open,
  presets,
  onChoose,
  onCancel,
}: MockSignInProps) {
  const id = useId();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    onChoose(
      name.trim() ? { email: trimmed, name: name.trim() } : { email: trimmed },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Who should sign in?</DialogTitle>
          <DialogDescription>
            This is a demo with no real sign-in. Pick anyone to continue as.
          </DialogDescription>
        </DialogHeader>
        {presets.length > 0 ? (
          <div className="-mx-2 flex flex-col gap-1">
            {presets.map((choice) => (
              <PresetButton
                key={choice.email}
                choice={choice}
                onChoose={onChoose}
              />
            ))}
          </div>
        ) : null}
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-email`}>Email</Label>
            <Input
              id={`${id}-email`}
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              data-1p-ignore
              placeholder="someone@example.com"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-name`}>
              Name <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id={`${id}-name`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="off"
              data-1p-ignore
            />
          </div>
          <Button type="submit" disabled={email.trim() === ''}>
            Sign in
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
