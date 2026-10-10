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
 * The Shell inspects the widget, wherever it is mounted: `useRuntime` reads
 * the one Runtime `toReact` made, not the component that drew it. Every mount
 * of the widget shows that same Runtime; it starts with the first mount and
 * stops with the last.
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

/** Start the host page in its element; React calls the returned function when the element goes. */
const host = (container: HTMLDivElement) => startHost(container, embed);

/** The host page, mounted where the Shell draws its app. */
const HostFrame = () => (
  <div ref={host} className="size-full overflow-y-auto" />
);

/** What the Shell runs: the host page, with the widget's Runtime. */
export const Embedding = Object.assign(HostFrame, {
  useRuntime: WidgetApp.useRuntime,
});
