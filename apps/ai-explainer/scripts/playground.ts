// Usage: pnpm playground [round]
// Starts the Playground in the background if it is not already running, then
// opens the browser on the given Round.
import { spawn, execFileSync } from 'node:child_process';

const url = 'http://localhost:5391';
const round = process.argv[2] ?? '';

async function running() {
  try {
    await fetch(url);
    return true;
  } catch {
    return false;
  }
}

if (!(await running())) {
  spawn('pnpm', ['exec', 'vp', 'dev'], {
    detached: true,
    stdio: 'ignore',
  }).unref();
  for (let tries = 0; !(await running()); tries++) {
    if (tries > 60) throw new Error(`Playground did not start at ${url}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

execFileSync('open', [`${url}/#${round}`]);
console.log(`Playground open at ${url}/#${round}`);
