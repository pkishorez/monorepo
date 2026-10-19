import { Button } from '@kestack/web-platform/components/button';
import { GoogleButton } from '@kestack/web-platform/components/google-button';
import { Spinner } from '@kestack/web-platform/components/spinner';
import { Gate } from './gate.tsx';
import { LocalForm } from './local-form.tsx';

/*
 * The screens Console shows in place of its pages: each says what happened
 * and offers the one thing to do next.
 */

function Failure({ message }: { readonly message: string | null }) {
  return message === null ? null : (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}

export function SignInScreen({
  mode,
  busy,
  failure,
  onSignIn,
}: {
  readonly mode: 'google' | 'local';
  readonly busy: boolean;
  readonly failure: string | null;
  readonly onSignIn: (email: string | null, name: string | null) => void;
}) {
  return (
    <Gate
      title="Sign in to Console"
      description="Deploy your Alchemy apps from GitHub: every push and every pull request, live."
    >
      <div className="flex flex-col gap-3">
        {mode === 'google' ? (
          <GoogleButton disabled={busy} onClick={() => onSignIn(null, null)} />
        ) : (
          <LocalForm
            busy={busy}
            submit="Sign in"
            onSignIn={(email, name) => onSignIn(email, name)}
          />
        )}
        <Failure message={failure} />
      </div>
    </Gate>
  );
}

/** A screen with one message and one action, as for a sign-in service that did not answer. */
export function NoticeScreen({
  title,
  description,
  action,
  busy,
  failure,
  onAction,
}: {
  readonly title: string;
  readonly description: string;
  readonly action: string;
  readonly busy: boolean;
  readonly failure: string | null;
  readonly onAction: () => void;
}) {
  return (
    <Gate title={title} description={description}>
      <div className="flex flex-col gap-3">
        <Button
          size="lg"
          variant="outline"
          disabled={busy}
          onClick={onAction}
          className="self-start"
        >
          {busy && <Spinner />}
          {action}
        </Button>
        <Failure message={failure} />
      </div>
    </Gate>
  );
}
