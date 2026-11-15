// Usage: osascript -l JavaScript scripts/simulator.js <command> [args]
//
//   island         prints where the Dynamic Island is on the Mac's screen
//   ax             prints Simulator's window and the elements directly in it
//   mouse <down|up|move> <x> <y>
//                  posts a left mouse event at screen point (x, y)
//
// simctl cannot touch the screen, so ios.sh long-presses the island with
// the Mac's mouse on Simulator's window. The runner image lets osascript
// drive System Events and post events (Accessibility); it reads the window
// through System Events, never Simulator itself.
ObjC.import('CoreGraphics');

// The island's centre as a share of the device's screen, from the
// simulator's own screenshots of an iPhone 17 Pro (1206 by 2622 pixels).
const ISLAND = { x: 0.5, y: 0.0365 };
// The device's screen, width over height.
const RATIO = 1206 / 2622;

function simulator() {
  const process = Application('System Events').processes.byName('Simulator');
  process.frontmost = true;
  return process.windows[0];
}

const frame = (element) => {
  const [x, y] = element.position();
  const [w, h] = element.size();
  return { x, y, w, h };
};

// The largest of `elements` with the screen's shape, if any.
function largestScreen(elements) {
  let best;
  for (const element of elements) {
    try {
      const box = frame(element);
      if (box.w < 100 || Math.abs(box.w / box.h - RATIO) > 0.02) continue;
      if (!best || box.w * box.h > best.w * best.h) best = box;
    } catch {}
  }
  return best;
}

// The device's screen in the window. The window's own children first:
// walking every element took over a minute on the runner.
function screen() {
  const window = simulator();
  const box =
    largestScreen(window.uiElements()) ??
    largestScreen(window.entireContents());
  if (!box) throw new Error('No element in the window has the screen shape.');
  return box;
}

// oxlint-disable-next-line no-unused-vars -- osascript calls run(argv)
function run(argv) {
  const [command, ...rest] = argv;
  if (command === 'island') {
    const box = screen();
    const x = Math.round(box.x + box.w * ISLAND.x);
    const y = Math.round(box.y + box.h * ISLAND.y);
    console.log(`screen ${JSON.stringify(box)}`);
    return `${x} ${y}`;
  }
  if (command === 'ax') {
    const window = simulator();
    const lines = [`window ${JSON.stringify(frame(window))}`];
    for (const element of window.uiElements()) {
      try {
        lines.push(
          `${element.role()} ${JSON.stringify(element.description())} ${JSON.stringify(frame(element))}`,
        );
      } catch (error) {
        lines.push(`? ${error}`);
      }
    }
    return lines.join('\n');
  }
  if (command === 'mouse') {
    const [kind, x, y] = rest;
    const type = {
      down: $.kCGEventLeftMouseDown,
      up: $.kCGEventLeftMouseUp,
      move: $.kCGEventMouseMoved,
    }[kind];
    const event = $.CGEventCreateMouseEvent(
      null,
      type,
      { x: Number(x), y: Number(y) },
      $.kCGMouseButtonLeft,
    );
    $.CGEventPost($.kCGHIDEventTap, event);
    return `${kind} ${x} ${y}`;
  }
  throw new Error(`Unknown command: ${command}`);
}
