import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  findProof,
  judge,
  liveActivityLog,
  nativeHapticsCalls,
  renderSummary,
  shellReports,
} from './proof.mjs';

const proof = (overrides = {}) => ({
  platform: 'ios',
  shell: {
    id: 'app.kishore.start',
    name: 'Kabuki Start',
    version: '1.0',
    build: '1',
  },
  serviceWorker: 'unsupported',
  haptics: { impact: true, notify: true, selection: true },
  liveActivity: { supported: true, id: null },
  ...overrides,
});

// As the iOS app prints it: CAPLog's Console plugin line, then the bridge's
// native calls.
const iosOutput = (line) =>
  [
    '⚡️  Loading app at https://pr7-start.kishore.app/native?proof=1...',
    `⚡️  [log] - [native-proof] ${JSON.stringify(line)}`,
    '⚡️  To Native ->  Haptics impact 81412345',
    '⚡️  To Native ->  Haptics notification 81412346',
    '⚡️  To Native ->  Haptics selectionStart 81412347',
    '⚡️  To Native ->  Haptics selectionChanged 81412348',
  ].join('\n');

test('reads the proof line from iOS output and from logcat', () => {
  assert.deepEqual(findProof(iosOutput(proof())), proof());
  const logcat = `11-14 07:18:01.123 I/Capacitor/Console( 4242): File: https://pr7-start.kishore.app/assets/app.js - Line 1 - Msg: [native-proof] ${JSON.stringify(proof({ platform: 'android' }))}`;
  assert.equal(findProof(logcat).platform, 'android');
});

test('no proof line, or a broken one, reads as null', () => {
  assert.equal(findProof('nothing here'), null);
  assert.equal(findProof('[native-proof] {"platform":'), null);
});

test('lists the Haptics methods the iOS bridge was asked for', () => {
  assert.deepEqual(nativeHapticsCalls(iosOutput(proof())), [
    'impact',
    'notification',
    'selectionStart',
    'selectionChanged',
  ]);
});

test('iOS passes with the shell id, true haptics and native calls', () => {
  const output = iosOutput(proof());
  const verdict = judge('ios', findProof(output), {
    nativeCalls: nativeHapticsCalls(output),
  });
  assert.equal(verdict.passed, true);
});

test('iOS fails on a haptic that did not take, or no native call', () => {
  const missed = proof({
    haptics: { impact: true, notify: false, selection: true },
  });
  assert.equal(
    judge('ios', missed, {
      nativeCalls: ['impact', 'notification', 'selectionStart'],
    }).passed,
    false,
  );
  assert.equal(judge('ios', proof(), { nativeCalls: [] }).passed, false);
});

test('fails without a proof, on the wrong platform, or in a plain browser', () => {
  assert.equal(judge('android', null).passed, false);
  assert.equal(judge('android', proof()).passed, false);
  assert.equal(
    judge('android', proof({ platform: 'android', shell: null })).passed,
    false,
  );
});

test('Android haptics, service worker and offline are findings only', () => {
  const verdict = judge(
    'android',
    proof({
      platform: 'android',
      serviceWorker: 'registered',
      haptics: { impact: false, notify: false, selection: false },
    }),
    {
      clicks: { impact: 'refused' },
      vibrator: 'no entry names the app',
      offline: 'skipped',
    },
  );
  assert.equal(verdict.passed, true);
  const findings = verdict.checks
    .filter((check) => check.ok === null)
    .map((check) => check.name);
  assert.ok(findings.includes('haptics impact (CDP click)'));
  assert.ok(findings.includes('service worker'));
  assert.ok(findings.includes('offline relaunch'));
});

test('the summary is a table with one row per check', () => {
  const summary = renderSummary('Native proof — ios', judge('ios', null));
  assert.match(summary, /^## Native proof — ios\n\n❌ Failed\n/);
  assert.match(summary, /\| shell id \| `—` \| ❌ \|/);
});

const report = (overrides = {}) => ({
  top: 186,
  bottom: 102,
  webViewTop: 186,
  color: '#ffffff',
  lightBars: true,
  ...overrides,
});

test("reads the shell's reports, skipping a broken one", () => {
  const output = [
    `[native-shell] ${JSON.stringify(report({ color: '#0a0a0a' }))}`,
    '[native-shell] {"top":',
    `11-14 07:18:01.123 I/ShellBars( 4242): [native-shell] ${JSON.stringify(report())}`,
  ].join('\n');
  assert.deepEqual(
    shellReports(output).map((each) => each.color),
    ['#0a0a0a', '#ffffff'],
  );
});

test("the bars pass in the theme's color, below the clock", () => {
  const bars = { theme: 'light', report: report(), top: 0.8, bottom: 0.9 };
  assert.equal(
    judge('ios', proof(), {
      nativeCalls: ['impact', 'notification', 'selection'],
      bars: [bars],
    }).passed,
    true,
  );
});

test('the bars fail in the wrong color, mostly covered, or with the page under the clock', () => {
  const ios = (bars) =>
    judge('ios', proof(), {
      nativeCalls: ['impact', 'notification', 'selection'],
      bars: [
        { theme: 'light', report: report(), top: 0.8, bottom: 0.9, ...bars },
      ],
    }).passed;
  assert.equal(ios({ report: report({ color: '#0a0a0a' }) }), false);
  assert.equal(ios({ top: 0.3 }), false);
  assert.equal(ios({ report: report({ webViewTop: 0 }) }), false);
  assert.equal(ios({ report: undefined }), false);
  assert.equal(
    judge('android', proof({ platform: 'android' }), {
      bars: [
        {
          theme: 'dark',
          report: report({ color: '#0a0a0a' }),
          top: 0.9,
          bottom: 0.9,
          pageColor: '#ffffff',
        },
      ],
    }).passed,
    false,
  );
});

test('a page without the Live Activity field fails', () => {
  assert.equal(
    judge('android', proof({ platform: 'android', liveActivity: undefined }))
      .passed,
    false,
  );
});

const liveOutput = [
  '⚡️  To Native ->  LiveActivity start 1234',
  '[live-activity] started 6C1F-AB active',
  '⚡️  TO JS {"id":"6C1F-AB"}',
  '[live-activity] background 6C1F-AB active',
].join('\n');

test("reads the Live Activity plugin's lines", () => {
  assert.deepEqual(liveActivityLog(liveOutput), {
    started: [{ id: '6C1F-AB', state: 'active' }],
    background: [{ id: '6C1F-AB', state: 'active' }],
  });
});

test('the Live Activity passes only with an id the plugin started and kept running', () => {
  const live = (id, log = liveOutput) =>
    judge('ios', proof(), {
      nativeCalls: ['impact', 'notification', 'selection'],
      live: {
        proof: proof({ liveActivity: { supported: true, id } }),
        log: liveActivityLog(log),
      },
    }).passed;
  assert.equal(live('6C1F-AB'), true);
  assert.equal(live(null), false);
  assert.equal(live('other'), false);
  assert.equal(
    live(
      '6C1F-AB',
      liveOutput.replace(
        'background 6C1F-AB active',
        'background 6C1F-AB ended',
      ),
    ),
    false,
  );
});

test('the Lock Screen photo is a finding that never fails the job', () => {
  const { passed, checks } = judge('ios', proof(), {
    nativeCalls: ['impact', 'notification', 'selection'],
    lockScreen: { black: 1, sameAsApp: undefined },
  });
  assert.equal(passed, true);
  assert.deepEqual(
    checks.find((check) => check.name === 'lock screen photo'),
    {
      name: 'lock screen photo',
      value: '100% black, — as the app',
      ok: null,
    },
  );
});
