/** The Auth Worker's Home Page, where a Sign-in is revoked. */
// Tests run with no env at all.
export const authHome = `${(import.meta.env.VITE_AUTH_URL ?? '').replace(/\/+$/, '')}/`;
