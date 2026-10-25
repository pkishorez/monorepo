/** What kind of place a Sign-in is, read from its User-Agent. */
export type SignInKind = 'browser' | 'device' | 'unknown';

// A Device sends `<app>/<version> (<hostname>)`; a browser's User-Agent
// starts the same way but never ends at the parenthesis.
const DEVICE = /^([^\s/()]+)\/\S+(?: \(([^()]+)\))?$/;

const BROWSERS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bEdg(?:e|A|iOS)?\//, 'Edge'],
  [/\b(?:OPR|Opera)\//, 'Opera'],
  [/\bSamsungBrowser\//, 'Samsung Internet'],
  [/\b(?:Firefox|FxiOS)\//, 'Firefox'],
  [/\b(?:Chrome|CriOS|Chromium)\//, 'Chrome'],
  [/\bVersion\/[\d.]+.*\bSafari\//, 'Safari'],
];

const SYSTEMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(?:iPhone|iPad|iPod)\b/, 'iOS'],
  [/\bAndroid\b/, 'Android'],
  [/\bCrOS\b/, 'ChromeOS'],
  [/\b(?:Macintosh|Mac OS X)\b/, 'macOS'],
  [/\bWindows\b/, 'Windows'],
  [/\bLinux\b/, 'Linux'],
];

const first = (
  table: ReadonlyArray<readonly [RegExp, string]>,
  userAgent: string,
) => table.find(([pattern]) => pattern.test(userAgent))?.[1];

/** A Sign-in's name as the Home Page shows it: "Chrome on macOS",
 * "acme-cli on laptop". */
export const signInName = (
  userAgent: string | null | undefined,
): { name: string; kind: SignInKind } => {
  const agent = userAgent?.trim() ?? '';
  if (!agent) return { name: 'Unknown device', kind: 'unknown' };

  if (agent.startsWith('Mozilla/')) {
    const browser = first(BROWSERS, agent);
    const system = first(SYSTEMS, agent);
    if (browser || system) {
      return {
        name:
          browser && system
            ? `${browser} on ${system}`
            : (browser ?? `A browser on ${system}`),
        kind: 'browser',
      };
    }
    return { name: 'A browser', kind: 'browser' };
  }

  const device = DEVICE.exec(agent);
  if (device) {
    const [, app, host] = device;
    return { name: host ? `${app} on ${host.trim()}` : app!, kind: 'device' };
  }
  return { name: 'Unknown device', kind: 'unknown' };
};
