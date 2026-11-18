/*
 * Which web pages may knock: a Connection's server and Connect Cloud let in
 * the same origin patterns. A browser names the page's origin on every
 * request, the WebSocket's included, so a page on another site cannot drive
 * a server from a tab the user happens to have open. A program that is not a
 * browser sends no Origin; each server says what it does with one.
 *
 * A pattern is an origin, `scheme://host[:port]`, where `*.` before the
 * host stands for any subdomains and `:*` for any port.
 */

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toRegExp = (pattern: string) => {
  const anyPort = pattern.endsWith(':*');
  const rest = anyPort ? pattern.slice(0, -2) : pattern;
  const at = rest.indexOf('://*.');
  const [scheme, host] =
    at === -1 ? [rest, ''] : [rest.slice(0, at + 3), rest.slice(at + 5)];
  const body =
    at === -1
      ? escape(scheme)
      : `${escape(scheme)}(?:[a-z0-9-]+\\.)+${escape(host)}`;
  return new RegExp(`^${body}${anyPort ? '(?::\\d+)?' : ''}$`, 'i');
};

/** Whether an origin matches one of `patterns`. */
export const allowsOrigin = (patterns: ReadonlyArray<string>) => {
  const all = patterns.map(toRegExp);
  return (origin: string) => all.some((pattern) => pattern.test(origin));
};
