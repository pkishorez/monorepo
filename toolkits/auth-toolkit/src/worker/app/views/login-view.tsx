import { LogIn, UserPlus } from 'lucide-react';
import { View } from '@kestack/kabuki/react';
import { returnDestination, signInFailure } from '../api/index.ts';
import { LoginLive } from '../pages/index.ts';
import { LinkButton, Notice, Skeleton, SkeletonText } from '../ui/index.ts';
import { Frame } from './frame.tsx';
import { TaskHeading, TaskHeadingPlaceholder } from './heading.tsx';
import { GoogleButton } from './google-button.tsx';
import { useRoot } from './root.ts';
import { TestSignInForm } from './test-sign-in-form.tsx';
import { Unready } from './unready.tsx';

/*
 * The Login Screen: "Sign in to {App}", "Sign in to continue to {Client}",
 * or "Add another account"; one Google button, and Test Sign-In below it
 * when it is on; why the last try failed, just above it.
 */
/** The Login Screen while it loads: its heading and the one button. */
function LoginPlaceholder() {
  const last = useRoot().last.current;
  return (
    <div className="flex flex-col">
      <TaskHeadingPlaceholder
        title={`Sign in to ${last?.brand.name ?? 'continue'}`}
        lead="Use your Google account."
      />
      <Skeleton className="mt-8 h-11 rounded-lg" />
      <p className="mt-8 text-sm text-pretty">
        <SkeletonText>
          Google shares your name, email address and picture with{' '}
          {last?.brand.name ?? 'the app'}.
        </SkeletonText>
      </p>
    </div>
  );
}

export const LoginView = View.make(LoginLive, ({ props, model, send }) => {
  if (props.status._tag !== 'Ready')
    return (
      <Unready status={props.status}>
        <LoginPlaceholder />
      </Unready>
    );
  const { data, waited } = props.status;
  const { brand, maxAccounts, continuing, testUsers } = data;
  const { query } = props;
  const accounts = data.accounts.list.length;
  const adding = query.add_account !== undefined && accounts > 0;
  const full = adding && accounts >= maxAccounts;
  const back = returnDestination(query.return_to, data);
  const failure =
    model.failure ??
    signInFailure(query.error, query.error_description, brand.name);

  const title = adding
    ? 'Add another account'
    : query.client_id !== undefined || continuing !== null
      ? continuing
        ? `Sign in to continue to ${continuing}`
        : 'Sign in to continue'
      : `Sign in to ${brand.name}`;
  const lead = adding
    ? `Choose another Google account to keep signed in to ${brand.name} on this browser.`
    : query.client_id !== undefined || continuing !== null
      ? `You'll use your ${brand.name} account.`
      : 'Use your Google account.';

  return (
    <Frame data={data} waited={waited}>
      <div className="flex flex-col">
        <TaskHeading
          mark={
            adding ? (
              <UserPlus aria-hidden="true" className="size-5" />
            ) : (
              <LogIn aria-hidden="true" className="size-5" />
            )
          }
          title={title}
          lead={lead}
        />
        <div className="mt-8 flex flex-col gap-3">
          {failure ? <Notice>{failure}</Notice> : null}
          {full ? (
            <Notice tone="warning">
              This browser already holds {maxAccounts} accounts, the most it
              can. Sign out of one, then add another.
            </Notice>
          ) : (
            <>
              <GoogleButton
                leaving={model.leaving}
                onClick={() => send({ _tag: 'GoogleChosen' })}
              />
              {testUsers ? (
                <TestSignInForm
                  askKey={testUsers.key}
                  busy={model.testing}
                  failure={model.testFailure}
                  onSubmit={(sign) => send({ _tag: 'TestChosen', ...sign })}
                />
              ) : null}
            </>
          )}
          {adding ? (
            <LinkButton tone="ghost" size="lg" href={back}>
              Cancel
            </LinkButton>
          ) : null}
        </div>
        <p className="mt-8 text-sm text-faint text-pretty">
          Google shares your name, email address and picture with {brand.name}.
        </p>
      </div>
    </Frame>
  );
});
