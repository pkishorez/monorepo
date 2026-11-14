// What the /native page proves, read from the app's own output, and what CI
// makes of it. Pure functions, so the tests run anywhere.

export const SHELL_ID = 'app.kishore.start';

const MARK = '[native-proof] ';

/** The site's Theme colors: its background, and its theme-color. */
export const THEME_COLORS = { dark: '#0a0a0a', light: '#ffffff' };

/**
 * A screenshot's bar band matches when at least this share of its pixels is
 * the page's color: the clock, the icons, the Dynamic Island and the home
 * indicator take the rest.
 */
export const BAND_SHARE = 0.6;

/**
 * The last proof line in `text`, parsed, or null. The page writes it with
 * console.log; logcat and the iOS app's output prefix it, so only what follows
 * the mark on its line is read.
 */
export function findProof(text) {
  let proof = null;
  for (const line of text.split('\n')) {
    const at = line.indexOf(MARK);
    if (at === -1) continue;
    try {
      proof = JSON.parse(line.slice(at + MARK.length).trim());
    } catch {
      // A line cut short, or the mark in some other message: keep looking.
    }
  }
  return proof;
}

/**
 * Every line the shell prints as `[native-shell] {json}` (ShellViewController
 * on iOS, ShellBars on Android), parsed: where the bars are, in screenshot
 * pixels, and the color the shell painted them.
 */
export function shellReports(text) {
  const reports = [];
  for (const line of text.split('\n')) {
    const at = line.indexOf('[native-shell] ');
    if (at === -1) continue;
    try {
      reports.push(JSON.parse(line.slice(at + 15).trim()));
    } catch {
      // A line cut short: skip it.
    }
  }
  return reports;
}

/**
 * What the Live Activity plugin printed: `[live-activity] started <id>
 * <state>` when one starts, and `[live-activity] background <id> <state>` for
 * each running one when the app goes to the background.
 */
export function liveActivityLog(text) {
  const started = [];
  const background = [];
  for (const match of text.matchAll(
    /\[live-activity\] (started|background) (\S+) (\w+)/g,
  )) {
    (match[1] === 'started' ? started : background).push({
      id: match[2],
      state: match[3],
    });
  }
  return { started, background };
}

/**
 * The Haptics methods Capacitor's iOS bridge was asked for, in order, from
 * the app's output: CAPLog prints each call as
 * `⚡️  To Native ->  Haptics impact 12345`.
 */
export function nativeHapticsCalls(text) {
  return [...text.matchAll(/To Native ->\s+Haptics\s+(\w+)/g)].map(
    (match) => match[1],
  );
}

/**
 * Each check as { name, value, ok }, where ok is true (passed), false (fails
 * the job) or null (a finding, recorded and never failing).
 *
 * `evidence` is what else the job saw: on iOS `nativeCalls` (from the app's
 * output), on Android `clicks` (each buzz button's result after a real click),
 * `vibrator` (what the vibrator service said), `serviceWorkerLater` (its state
 * once the clicks are done) and `offline` (whether the page drew with the
 * network off).
 */
export function judge(platform, proof, evidence = {}) {
  const checks = [];
  const add = (name, value, ok) => checks.push({ name, value, ok });

  add('proof line', proof ? 'found' : 'missing', proof !== null);
  add('platform', proof?.platform ?? '—', proof?.platform === platform);
  add('shell id', proof?.shell?.id ?? '—', proof?.shell?.id === SHELL_ID);
  add(
    'shell version',
    proof?.shell ? `${proof.shell.version} (${proof.shell.build})` : '—',
    null,
  );

  for (const name of ['impact', 'notify', 'selection']) {
    const value = proof?.haptics?.[name];
    add(
      `haptics ${name} (page, unprompted)`,
      String(value ?? '—'),
      platform === 'ios' ? value === true : null,
    );
  }

  if (platform === 'ios') {
    const calls = evidence.nativeCalls ?? [];
    const called = (method) => calls.some((call) => call.startsWith(method));
    add(
      'haptics native calls',
      calls.length ? calls.join(', ') : 'none',
      called('impact') && called('notification') && called('selection'),
    );
  }

  if (platform === 'android') {
    for (const [name, value] of Object.entries(evidence.clicks ?? {}))
      add(`haptics ${name} (CDP click)`, value, null);
    if (evidence.vibrator !== undefined)
      add('vibrator service', evidence.vibrator, null);
  }

  // Contract B: the page always says whether it can start a Live Activity.
  add(
    'live activity supported',
    String(proof?.liveActivity?.supported ?? '—'),
    proof?.liveActivity ? null : false,
  );

  for (const bars of evidence.bars ?? []) barChecks(add, platform, bars);
  if (evidence.live) liveChecks(add, evidence.live);

  add('service worker', proof?.serviceWorker ?? '—', null);
  if (evidence.serviceWorkerLater !== undefined)
    add('service worker, after the clicks', evidence.serviceWorkerLater, null);
  if (evidence.offline !== undefined)
    add('offline relaunch', evidence.offline, null);

  return { passed: checks.every((check) => check.ok !== false), checks };
}

/**
 * One theme's bars: `theme` asked for, `report` (the shell's last line),
 * `top` and `bottom` (the share of each band in the page's color), and on
 * Android `pageColor` (the page's own background, read over CDP).
 */
function barChecks(add, platform, { theme, report, top, bottom, pageColor }) {
  const want = THEME_COLORS[theme];
  const percent = (share) =>
    share === undefined ? '—' : `${Math.round(share * 100)}% ${want}`;
  if (pageColor !== undefined)
    add(`${theme}: page background`, pageColor, pageColor === want);
  add(
    `${theme}: shell's bar color`,
    report?.color ?? '—',
    report?.color === want,
  );
  add(`${theme}: status bar band`, percent(top), (top ?? 0) >= BAND_SHARE);
  if ((report?.bottom ?? 0) > 0)
    add(`${theme}: bottom band`, percent(bottom), (bottom ?? 0) >= BAND_SHARE);
  if (platform === 'ios')
    add(
      `${theme}: web view below the clock`,
      report
        ? `web view at ${report.webViewTop}px, safe area ${report.top}px`
        : '—',
      report !== undefined && report.top > 0 && report.webViewTop >= report.top,
    );
}

/**
 * The Live Activity run: the page's proof (`proof.liveActivity.id`, returned
 * by the plugin's start) and the plugin's own lines (`log`).
 */
function liveChecks(add, { proof, log }) {
  const id = proof?.liveActivity?.id ?? null;
  add(
    'live activity id (page)',
    id ?? '—',
    typeof id === 'string' && id !== '',
  );
  const started = log.started.find((entry) => entry.id === id);
  add(
    'live activity started (native)',
    started ? `${started.id} ${started.state}` : 'no line',
    started !== undefined,
  );
  const running = log.background.find((entry) => entry.id === id);
  add(
    'live activity running in the background (native)',
    running ? `${running.id} ${running.state}` : 'no line',
    running?.state === 'active',
  );
}

/** The job summary: a heading, the verdict and one row per check. */
export function renderSummary(title, { passed, checks }) {
  const mark = (ok) => (ok === null ? 'ℹ️ finding' : ok ? '✅' : '❌');
  return [
    `## ${title}`,
    '',
    passed ? '✅ Passed' : '❌ Failed',
    '',
    '| Check | Value | Result |',
    '| --- | --- | --- |',
    ...checks.map(
      ({ name, value, ok }) =>
        `| ${name} | \`${String(value).replaceAll('|', '\\|')}\` | ${mark(ok)} |`,
    ),
    '',
  ].join('\n');
}
