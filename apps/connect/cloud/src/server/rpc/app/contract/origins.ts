export const DEFAULT_ORIGINS: ReadonlyArray<string> = [
  'http://localhost:*',
  'http://127.0.0.1:*',
  'http://[::1]:*',
  'https://localhost:*',
  'https://*.localhost:*',
  'https://*.kishore.app',
  'https://*.kishore.computer',
];

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

export const allowsOrigin = (patterns: ReadonlyArray<string>) => {
  const all = patterns.map(toRegExp);
  return (origin: string) => all.some((pattern) => pattern.test(origin));
};
