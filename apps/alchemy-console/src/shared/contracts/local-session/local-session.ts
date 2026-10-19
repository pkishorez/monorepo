/**
 * The cookie a Local mode browser keeps its Active Local Account's token in,
 * so the Worker knows the visitor before any call, as when it draws a page.
 * A deployed build never reads it.
 */
export const LOCAL_SESSION_COOKIE = 'console-local-session';
