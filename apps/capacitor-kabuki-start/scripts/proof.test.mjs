import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  findProof,
  judge,
  nativeHapticsCalls,
  renderSummary,
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
