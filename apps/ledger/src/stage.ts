/** The shared sign-in service, for this stage. */
export const AUTH_URL = import.meta.env.DEV
  ? 'https://auth.kishore.computer'
  : 'https://auth.kishore.app';
