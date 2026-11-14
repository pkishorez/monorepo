// What the /native page proves, read from the app's own output, and what CI
// makes of it. Pure functions, so the tests run anywhere.

export const SHELL_ID = 'app.kishore.start';

const MARK = '[native-proof] ';

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

  add('service worker', proof?.serviceWorker ?? '—', null);
  if (evidence.serviceWorkerLater !== undefined)
    add('service worker, after the clicks', evidence.serviceWorkerLater, null);
  if (evidence.offline !== undefined)
    add('offline relaunch', evidence.offline, null);

  return { passed: checks.every((check) => check.ok !== false), checks };
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
