import { LoginScreen } from './auth-screens';
import { branding, pause, plainBranding } from './fixtures/data';

const signIn = () => pause(2000);

export default {
  loading: (
    <LoginScreen
      branding={branding}
      state={{ status: 'loading' }}
      onSignIn={signIn}
    />
  ),
  'sign in': (
    <LoginScreen
      branding={branding}
      state={{ status: 'ready', continuing: false }}
      onSignIn={signIn}
    />
  ),
  'sign in to continue': (
    <LoginScreen
      branding={branding}
      state={{ status: 'ready', continuing: true }}
      onSignIn={signIn}
    />
  ),
  'with an error': (
    <LoginScreen
      branding={branding}
      state={{
        status: 'ready',
        continuing: true,
        error: 'The app sent an invalid request. Go back and try again.',
      }}
      onSignIn={signIn}
    />
  ),
  'without a logo': (
    <LoginScreen
      branding={plainBranding}
      state={{ status: 'ready', continuing: false }}
      onSignIn={signIn}
    />
  ),
};
