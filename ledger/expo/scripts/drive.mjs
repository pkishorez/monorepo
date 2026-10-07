// Drives the running app for agents, with Metro on :8081 (or METRO_PORT) and the app open on
// the Simulator, through Metro's inspector (CDP Runtime.evaluate). With
// several devices on one Metro, DEVICE picks the one whose inspector title
// has that text (default `iPhone`; the Android emulator's says `sdk_gphone`):
//   node scripts/drive.mjs tap "<accessibilityLabel or text>"
//   node scripts/drive.mjs type "<accessibilityLabel>" "<text>"
//   node scripts/drive.mjs call "<accessibilityLabel or text>" <handler>
//   node scripts/drive.mjs js "<expression>"
// A "tap" finds the last mounted element, in tree order, with that label or
// text and an onPress, and calls it: the app's own handler, not a real touch,
// so gestures (Gesture Handler) are out of its reach. Screenshots:
// `xcrun simctl io booted screenshot <file>`.
const [, , command, arg, more] = process.argv;
const port = process.env.METRO_PORT ?? '8081';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const device = process.env.DEVICE ?? 'iPhone';
const target = list.find((page) => page.title.includes(device)) ?? list[0];
const ws = new WebSocket(target.webSocketDebuggerUrl, {
  headers: { Origin: `http://127.0.0.1:${port}` },
});
await new Promise((resolve) => ws.addEventListener('open', resolve));

const ACT = (label, handler, value) => `(() => {
  const hook = globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  const roots = [];
  for (const id of hook.renderers.keys()) for (const r of hook.getFiberRoots(id)) roots.push(r);
  const text = (f) => {
    let out = '';
    const go = (n) => { for (; n; n = n.sibling) {
      const p = n.memoizedProps;
      if (typeof p === 'string' || typeof p === 'number') out += p;
      go(n.child);
    } };
    go(f.child);
    return out.trim();
  };
  const want = ${JSON.stringify(label)};
  let found = null;
  const walk = (f) => { for (; f; f = f.sibling) {
    const p = f.memoizedProps;
    if (p && typeof p === 'object' && typeof p[${JSON.stringify(handler)}] === 'function' &&
        (p.accessibilityLabel === want || text(f) === want)) found = f;
    walk(f.child);
  } };
  for (const r of roots) walk(r.current);
  if (!found) return 'not found: ' + want;
  if (found.memoizedProps.disabled) return 'disabled: ' + want;
  found.memoizedProps[${JSON.stringify(handler)}](${
    value === undefined
      ? '{ nativeEvent: {}, persist() {} }'
      : JSON.stringify(value)
  });
  return ${JSON.stringify(handler)} + ': ' + want;
})()`;

const expression =
  command === 'tap'
    ? ACT(arg, 'onPress')
    : command === 'type'
      ? ACT(arg, 'onChangeText', more)
      : command === 'call'
        ? ACT(arg, more)
        : arg;
ws.send(
  JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: { expression, returnByValue: true, awaitPromise: true },
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
