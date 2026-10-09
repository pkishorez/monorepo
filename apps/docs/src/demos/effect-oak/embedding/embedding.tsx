import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { toReact } from 'effect-oak/react';
import { startHost } from './host-page/index.js';
import { HostLive, wire } from './port/index.js';
import { Widget, WidgetView } from './widget/index.js';

/*
 * An Effect Oak widget embedded in a page that is not Effect Oak.
 *
 * Effect Oak can only run an app as a React component (`toReact`), so
 * `embed` is written here: it gives the widget its flags through the wire,
 * mounts it into the host's element with its own React root, and returns the
 * handle the host talks through. The host page is plain DOM.
 *
 * The Shell inspects the widget, wherever it is mounted: `toReact`'s Log and
 * Time Travel hooks read the one running app, not the component that drew it.
 * That also means the widget can be mounted only once at a time.
 */

const WidgetApp = toReact(Widget, WidgetView, HostLive);

const embed = (
  element: HTMLElement,
  flags: { readonly initialCount: number },
) => {
  wire.setFlags(flags);
  const root = createRoot(element);
  root.render(<WidgetApp />);
  return {
    sendStep: wire.sendStep,
    onCount: wire.onCount,
    // Unmounting a root while another is committing is not allowed: wait a tick.
    dispose: () => queueMicrotask(() => root.unmount()),
  };
};

/** The host page, mounted where the Shell draws its app. */
const HostFrame = () => {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => startHost(container.current!, embed), []);
  return <div ref={container} className="size-full overflow-y-auto" />;
};

/** What the Shell runs: the host page, with the widget's Log and Time Travel. */
export const Embedding = Object.assign(HostFrame, {
  useLog: WidgetApp.useLog,
  useTimeTravel: WidgetApp.useTimeTravel,
});
