/** The Auth Worker this console signs in with, the same on both sides. */
export const authWorkerUrl = import.meta.env.DEV
  ? 'https://auth.kishore.computer'
  : 'https://auth.kishore.app';
