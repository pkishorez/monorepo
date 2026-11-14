/*
 * Google's own sign-in button lives in auth-toolkit, so the Auth Worker's
 * pages and every app draw the same one: auth-toolkit cannot import the Web
 * Platform, and the Web Platform already builds on auth-toolkit.
 */
export {
  GoogleButton,
  type GoogleButtonLabel,
  type GoogleButtonProps,
  type GoogleButtonTheme,
} from '@kestack/auth-toolkit/google-button';
