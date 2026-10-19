import { useId } from 'react';
import { Button } from '@kestack/web-platform/components/button';
import {
  Field,
  FieldDescription,
  FieldLabel,
} from '@kestack/web-platform/components/field';
import { Input } from '@kestack/web-platform/components/input';
import { Spinner } from '@kestack/web-platform/components/spinner';

/*
 * Local mode's sign-in: whoever the visitor types, asking no one, as the
 * Auth Worker's Local mode does. An email names the same account every
 * time; the name is the part before the `@` unless one is typed.
 */

export function LocalForm({
  busy,
  submit,
  onSignIn,
}: {
  readonly busy: boolean;
  readonly submit: string;
  readonly onSignIn: (email: string, name: string | null) => void;
}) {
  const id = useId();
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const name = String(form.get('name') ?? '').trim();
        onSignIn(String(form.get('email') ?? ''), name === '' ? null : name);
      }}
    >
      <Field>
        <FieldLabel htmlFor={`${id}-email`}>Email</FieldLabel>
        <Input
          id={`${id}-email`}
          name="email"
          type="email"
          required
          autoComplete="email"
          spellCheck={false}
          className="text-base sm:text-sm"
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${id}-name`}>
          Name <span className="text-muted-foreground">(optional)</span>
        </FieldLabel>
        <Input
          id={`${id}-name`}
          name="name"
          autoComplete="name"
          className="text-base sm:text-sm"
        />
        <FieldDescription>
          Local mode signs in whoever you type. Only invited emails get in.
        </FieldDescription>
      </Field>
      <Button type="submit" size="lg" disabled={busy}>
        {busy && <Spinner />}
        {submit}
      </Button>
    </form>
  );
}
