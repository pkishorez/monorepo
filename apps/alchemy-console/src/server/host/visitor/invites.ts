/*
 * The Invite list: the emails allowed to use Console, from the Worker's
 * `CONSOLE_INVITES` var, comma-separated. Emails are compared as the Auth
 * Worker writes them, trimmed and in lower case.
 */

const normal = (email: string) => email.trim().toLowerCase();

/** Whether `email` is on the list `invites` writes. */
export const isInvited = (invites: string, email: string): boolean =>
  invites
    .split(',')
    .map(normal)
    .filter((each) => each !== '')
    .includes(normal(email));
