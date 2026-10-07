import { ErrorScreen, NotFoundScreen } from './auth-screens';
import { branding, plainBranding } from './fixtures/data';

export default {
  'with a logo': <NotFoundScreen branding={branding} />,
  'without a logo': <NotFoundScreen branding={plainBranding} />,
  'sign-in error': (
    <ErrorScreen
      branding={branding}
      error="state_mismatch"
      description="The sign-in took too long or was started in another tab."
    />
  ),
  'sign-in error without details': (
    <ErrorScreen branding={branding} error="UNKNOWN" description={undefined} />
  ),
};
