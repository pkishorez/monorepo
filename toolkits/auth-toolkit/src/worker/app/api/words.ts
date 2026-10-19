/*
 * What the pages say when something did not work: each code the Auth
 * Worker or Google sends back, in words that say what happened and what to
 * do next.
 */

/** Why a Google sign-in came back without signing in. */
export const signInFailure = (
  code: string | undefined,
  description: string | undefined,
  app: string,
): string | undefined => {
  if (!code && !description) return undefined;
  switch (code?.toLowerCase()) {
    case 'access_denied':
      return "You cancelled signing in with Google. Try again when you're ready.";
    case 'not_admitted':
      return `That Google account can't sign in to ${app}. Choose another account.`;
    case 'state_mismatch':
    case 'state_not_found':
    case 'invalid_state':
    case 'please_restart_the_process':
      return 'That sign-in was started in another tab or took too long. Start again here.';
    case 'email_not_found':
    case 'unable_to_get_user_info':
      return "Google didn't share your email address, which signing in needs. Try again and allow it.";
    case 'account_not_linked':
      return 'That email already signs in another way. Use the account you first signed in with.';
    case 'signup_disabled':
      return `New accounts can't sign up for ${app}. Use an account that already has access.`;
    default:
      return description
        ? `Google sign-in didn't finish: ${description.replace(/_/g, ' ')}.`
        : "Google sign-in didn't finish. Try again.";
  }
};

/** What a Device Login code's failure means for the person holding it. */
export const deviceCodeFailure = (code: string, message: string) => {
  switch (code) {
    case 'invalid_code':
      return "That code doesn't match a sign-in. Check it against your device and try again.";
    case 'expired_code':
      return 'That code has expired. Start signing in again on your device to get a new one.';
    case 'already_answered':
      return 'That code was already answered. Start signing in again on your device if you need to.';
    case 'claimed':
      return 'Another account is already approving that code. Start signing in again on your device.';
    case 'account_not_signed_in':
      return "That account isn't signed in on this browser anymore. Choose another one.";
    default:
      return message;
  }
};
