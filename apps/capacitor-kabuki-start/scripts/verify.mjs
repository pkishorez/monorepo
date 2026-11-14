// Usage: node scripts/verify.mjs <android|ios> <out-dir> [title]
//
// Judges what a native job left in <out-dir>, writes proof.json and
// verdict.json there, adds the table to the job summary, and exits 1 when a
// check fails. Runs after the device is gone, so it reads files only.
import {
  appendFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { decodePng, shareOfColor, shareSame } from './png.mjs';
import {
  THEME_COLORS,
  findProof,
  judge,
  liveActivityLog,
  nativeHapticsCalls,
  renderSummary,
  shellReports,
} from './proof.mjs';

const [platform, out, title = `Native proof — ${platform}`] =
  process.argv.slice(2);
if (platform !== 'android' && platform !== 'ios') {
  console.error('Usage: verify.mjs <android|ios> <out-dir> [title]');
  process.exit(2);
}

const read = (name) =>
  existsSync(join(out, name)) ? readFileSync(join(out, name), 'utf8') : '';
const readJson = (name) => (read(name) ? JSON.parse(read(name)) : undefined);

let proof;
const evidence = { bars: [] };

/** How much of each bar band in `screenshot` is the theme's color. */
function bars(theme, screenshot, report, pageColor) {
  const entry = { theme, report, pageColor };
  if (existsSync(join(out, screenshot)) && report) {
    const image = decodePng(readFileSync(join(out, screenshot)));
    const want = THEME_COLORS[theme];
    entry.top = shareOfColor(image, 0, report.top, want);
    entry.bottom = shareOfColor(
      image,
      image.height - report.bottom,
      image.height,
      want,
    );
  }
  evidence.bars.push(entry);
}

if (platform === 'ios') {
  const output = read('app-output.txt');
  proof = findProof(output);
  evidence.nativeCalls = nativeHapticsCalls(output);
  // ios.sh opens the page once per theme, and once more with live=1 when
  // LIVE_ACTIVITY is set.
  bars('dark', 'ios.png', shellReports(output).at(-1));
  bars(
    'light',
    'ios-light.png',
    shellReports(read('app-output-light.txt')).at(-1),
  );
  if (existsSync(join(out, 'app-output-live.txt'))) {
    const live = read('app-output-live.txt');
    evidence.live = { proof: findProof(live), log: liveActivityLog(live) };
  }
  // A finding, never a failure: how much of the Lock Screen photo is black
  // (the screen asleep) and how much is the app's own screenshot.
  if (existsSync(join(out, 'ios-lock-screen.png'))) {
    const shot = decodePng(readFileSync(join(out, 'ios-lock-screen.png')));
    evidence.lockScreen = {
      black: shareOfColor(shot, 0, shot.height, '#000000', 16),
      sameAsApp: existsSync(join(out, 'ios-live.png'))
        ? shareSame(shot, decodePng(readFileSync(join(out, 'ios-live.png'))))
        : undefined,
    };
  }
} else {
  // The page may log before CDP attaches, so logcat is read too.
  const page = readJson('android-proof.json');
  proof = findProof(page?.proofLine ?? '') ?? findProof(read('logcat.txt'));
  if (page?.clicks) evidence.clicks = page.clicks;
  if (page?.after?.['service-worker'])
    evidence.serviceWorkerLater = page.after['service-worker'];
  const vibrator = read('vibrator.txt');
  if (vibrator) {
    const mentions = vibrator
      .split('\n')
      .filter((line) => line.includes('app.kishore.start'));
    evidence.vibrator = mentions.length
      ? `${mentions.length} entries name the app; first: ${mentions[0].trim().slice(0, 160)}`
      : 'no entry names the app';
  }
  const themes = readJson('android-themes.json') ?? {};
  for (const theme of ['dark', 'light']) {
    const seen = themes[theme] ?? {};
    bars(
      theme,
      `android-${theme}.png`,
      shellReports(seen.shell ?? '').at(-1),
      seen.background ?? '—',
    );
  }
  const offline = readJson('offline.json');
  if (offline) evidence.offline = offline.result;
}

const verdict = judge(platform, proof, evidence);
writeFileSync(join(out, 'proof.json'), `${JSON.stringify(proof, null, 2)}\n`);
writeFileSync(
  join(out, 'verdict.json'),
  `${JSON.stringify({ platform, proof, evidence, ...verdict }, null, 2)}\n`,
);

const summary = renderSummary(title, verdict);
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
if (!verdict.passed) process.exitCode = 1;
