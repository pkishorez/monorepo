// Touches the running app by hand, in development only, through Metro's
// inspector (as drive.mjs does) and the GestureSurface's dev hook,
// `globalThis.__touches.ledger`: the samples go into use-gesture's core as
// Gesture Handler's would, so a thumb can rest while another finger swipes,
// which the Simulator's own tools cannot do. Points are screen points.
//   node scripts/touch.mjs thumb 0,65 35,0   thumb down at the left, a finger
//                                            down at the right, sliding by each
//                                            leg in turn; both stay down
//   node scripts/touch.mjs more -50,0         the finger slides on by each leg
//   node scripts/touch.mjs lift              the finger lifts, then the thumb
//   node scripts/touch.mjs drop              the thumb lifts first: called off
//   node scripts/touch.mjs swipe 8,400 140,0 one finger from a point, by a leg
const [, , command, ...args] = process.argv;
const list = await (await fetch('http://127.0.0.1:8081/json/list')).json();
const target = list.find((page) => page.title.includes('iPhone')) ?? list[0];
const ws = new WebSocket(target.webSocketDebuggerUrl, {
  headers: { Origin: 'http://127.0.0.1:8081' },
});
await new Promise((resolve) => ws.addEventListener('open', resolve));

const pair = (text) => text.split(',').map(Number);

// Runs in the app, all at once: `steps` of [kind, id, x, y]. Plain and
// synchronous on purpose: an async function evaluated through the inspector
// crashed Hermes' debugger (Expo Go 57.0.9) as its promise resumed.
const RUN = (steps) => `(() => {
  const touches = globalThis.__touches?.ledger;
  if (!touches) return 'no surface: is the app open in development?';
  const at = (globalThis.__touchAt ??= {});
  for (const [kind, id, x, y] of ${JSON.stringify(steps)}) {
    if (kind === 'up') {
      const [px, py] = at[id] ?? [x, y];
      touches.up(id, px, py);
      delete at[id];
      continue;
    }
    // 'by' moves a finger still down by (x, y) from where it is.
    const [px, py] = kind === 'by' ? (at[id] ?? [0, 0]) : [0, 0];
    const [nx, ny] = [px + x, py + y];
    touches[kind === 'by' ? 'move' : kind](id, nx, ny);
    at[id] = [nx, ny];
  }
  return 'done';
})()`;

const THUMB = [40, 700];
const FINGER = [300, 420];
const MOVES = 8;

// One finger sliding from `from` by each leg in turn.
const slide = (id, from, legs) => {
  const steps = [];
  let [x, y] = from;
  for (const [dx, dy] of legs) {
    for (let i = 1; i <= MOVES; i++) {
      steps.push(['move', id, x + (dx * i) / MOVES, y + (dy * i) / MOVES]);
    }
    x += dx;
    y += dy;
  }
  return steps;
};

const plans = {
  thumb: () => [
    ['down', 1, ...THUMB],
    ['down', 2, ...FINGER],
    ...slide(2, FINGER, args.map(pair)),
  ],
  more: () =>
    args
      .map(pair)
      .flatMap(([dx, dy]) =>
        Array.from({ length: MOVES }, () => ['by', 2, dx / MOVES, dy / MOVES]),
      ),
  lift: () => [
    ['up', 2, 0, 0],
    ['up', 1, 0, 0],
  ],
  drop: () => [
    ['up', 1, 0, 0],
    ['up', 2, 0, 0],
  ],
  swipe: () => {
    const from = pair(args[0]);
    const legs = args.slice(1).map(pair);
    const end = legs.reduce(([x, y], [dx, dy]) => [x + dx, y + dy], from);
    return [['down', 1, ...from], ...slide(1, from, legs), ['up', 1, ...end]];
  },
};

if (!(command in plans)) {
  console.log(`usage: touch.mjs ${Object.keys(plans).join('|')} [legs]`);
  process.exit(1);
}
ws.send(
  JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: RUN(plans[command]()),
      returnByValue: true,
    },
  }),
);
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id !== 1) return;
  console.log(
    JSON.stringify(
      message.result?.result?.value ?? message.result ?? message.error,
    ),
  );
  ws.close();
  process.exit(0);
});
setTimeout(() => {
  console.log('timeout');
  process.exit(1);
}, 8000);
