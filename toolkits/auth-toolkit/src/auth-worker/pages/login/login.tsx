import {
  LocalSignIn,
  LoginScreen,
  type Branding,
  type LocalSignInChoice,
} from '@kstackz/ui-toolkit/components/blocks/auth';
import { useMemo, useState } from 'react';

import {
  createAuthorizationClient,
  navigate,
  pageQuery,
} from '../auth-api/index.js';
import {
  ADD_ACCOUNT,
  returnDestination,
  useScreenRoute,
} from '../screen-routing/index.js';
import {
  useSignedInAccounts,
  type MultiSessionOptions,
} from '../signed-in-accounts/index.js';

interface LoginPageProps {
  branding: Branding;
  multiSession: MultiSessionOptions;
  /** Offers the Test Sign-In beside Google (local stage only). */
  testSignIn?: boolean | undefined;
}

const TEST_PRESETS: ReadonlyArray<LocalSignInChoice> = [
  { email: 'ada@ledger.test', name: 'Ada' },
  { email: 'grace@ledger.test', name: 'Grace' },
];

export function LoginPage({
  branding,
  multiSession,
  testSignIn,
}: LoginPageProps) {
  const [testing, setTesting] = useState(false);
  const client = useMemo(createAuthorizationClient, []);
  const session = client.useSession();
  const show = useScreenRoute('login', session);
  const accounts = useSignedInAccounts(client, session, multiSession);
  const query = useMemo(pageQuery, []);
  const continuing = query.has('client_id');
  const adding = query.has(ADD_ACCOUNT) && session.data !== null;
  const error = query.get('error_description') ?? undefined;

  const signIn = () =>
    client.signIn.social({
      provider: 'google',
      callbackURL: continuing
        ? undefined
        : new URL(
            returnDestination(window.location.search),
            window.location.href,
          ).href,
    });

  const signInForTest = async (choice: LocalSignInChoice) => {
    setTesting(false);
    const { data, error } = await client.signIn
      .test(choice)
      .catch((cause: unknown) => ({
        data: null,
        error: { message: String(cause) },
      }));
    if (error) {
      // Back to the Login Screen, which shows the reason.
      const here = new URL(window.location.href);
      here.searchParams.set(
        'error_description',
        error.message ?? 'Test sign-in failed',
      );
      navigate(here.href);
      return;
    }
    navigate(
      data?.url ??
        new URL(returnDestination(window.location.search), window.location.href)
          .href,
    );
  };

  return (
    <>
      <LoginScreen
        branding={branding}
        state={
          show
            ? { status: 'ready', continuing, adding, error }
            : { status: 'loading' }
        }
        accounts={accounts}
        onSignIn={signIn}
      />
      {testSignIn ? (
        <>
          <button
            type="button"
            className="fixed inset-x-0 bottom-4 mx-auto w-fit text-xs text-muted-foreground underline"
            onClick={() => setTesting(true)}
          >
            Test sign-in (local only)
          </button>
          <LocalSignIn
            open={testing}
            presets={TEST_PRESETS}
            onChoose={(choice) => void signInForTest(choice)}
            onCancel={() => setTesting(false)}
          />
        </>
      ) : null}
    </>
  );
}
