import { FlaskConical } from 'lucide-react';
import type { FormEvent } from 'react';
import { Button, Notice, buttonClass, cx } from '../ui/index.ts';

/*
 * Test Sign-In, folded under its own button beside Google's: an email
 * ending in .test, and the key when the Auth Worker has one. A refusal
 * opens it and says why.
 */

const input =
  'mt-2 h-11 rounded-lg bg-surface px-3.5 shadow-[0_0_0_1px_var(--color-line)] outline-none transition-shadow duration-150 placeholder:text-faint hover:shadow-[0_0_0_1px_var(--color-faint)] focus-visible:shadow-[0_0_0_2px_var(--color-ring)] focus-visible:outline-none aria-[invalid]:shadow-[0_0_0_1px_var(--color-danger)] motion-reduce:transition-none';

export function TestSignInForm({
  askKey,
  busy,
  failure,
  onSubmit,
}: {
  askKey: boolean;
  busy: boolean;
  failure: string | null;
  onSubmit: (sign: { email: string; key?: string }) => void;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = form.get('email');
    const key = form.get('key');
    onSubmit({
      email: typeof email === 'string' ? email : '',
      ...(askKey ? { key: typeof key === 'string' ? key : '' } : {}),
    });
  };
  return (
    <details open={failure !== null || undefined} className="group">
      <summary
        className={cx(
          buttonClass('ghost', 'lg'),
          'list-none text-muted-fg group-open:text-fg [&::-webkit-details-marker]:hidden',
        )}
      >
        <FlaskConical aria-hidden="true" className="size-4" />
        Sign in as a test user
      </summary>
      <form onSubmit={submit} noValidate className="mt-3 flex flex-col">
        <label htmlFor="test-email" className="text-sm font-medium">
          Test user’s email
        </label>
        <input
          id="test-email"
          name="email"
          type="email"
          required
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="ada@example.test"
          aria-invalid={failure ? true : undefined}
          aria-describedby="test-email-hint"
          className={input}
        />
        <p id="test-email-hint" className="mt-2 text-sm text-faint">
          Any email ending in .test. A new one makes a new test user.
        </p>
        {askKey ? (
          <>
            <label htmlFor="test-key" className="mt-4 text-sm font-medium">
              Test key
            </label>
            <input
              id="test-key"
              name="key"
              type="password"
              required
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              aria-invalid={failure ? true : undefined}
              className={input}
            />
          </>
        ) : null}
        {failure ? (
          <div className="mt-3">
            <Notice>{failure}</Notice>
          </div>
        ) : null}
        <Button
          type="submit"
          tone="secondary"
          size="lg"
          className="mt-4"
          busy={busy && 'Signing in…'}
        >
          Sign in as test user
        </Button>
      </form>
    </details>
  );
}
