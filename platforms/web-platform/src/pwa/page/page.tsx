import { type ReactNode, useEffect } from 'react';
import { InstallPrompt, useInstall } from './extras/index.js';
import { pwaHead, pwaIncluded, pwaName } from './head/index.js';
import { PwaProvider, UpdatePrompt, usePwa } from './status/index.js';

/*
 * The PWA in a Kabuki Start app's Document: `PwaHead` in its `head`, and
 * `Pwa` around the app. Together they put the manifest, the Apple icon and
 * the Build ID in every page's head, register the worker after mount, show
 * the Update Prompt while a new version waits, and offer install once.
 * An app may reload into a new version as soon as it is ready instead of
 * asking, and offer no install. In a build with `noPwa()` both draw
 * nothing of their own.
 */

/** What the PWA asks of the reader: whether to take a new version, whether to install. */
export type PwaPrompts = {
  /** `prompt`, the default, asks before reloading; `reload` reloads as soon as a new version is ready. */
  readonly update?: 'prompt' | 'reload';
  /** `prompt`, the default, offers install once; `off` never does. */
  readonly install?: 'prompt' | 'off';
};

/** The manifest link, the Apple icon and title, the Splash if on, and the Build ID tags, for the Document's `head`. */
export function PwaHead() {
  if (!pwaIncluded()) return null;
  const { meta, links } = pwaHead();
  return (
    <>
      {meta.map((tag) => (
        <meta key={tag.name} {...tag} />
      ))}
      {links.map((link) => (
        <link key={link.href} {...link} />
      ))}
    </>
  );
}

/** Around the app: the worker, the Update Prompt and the Install Prompt, titled with the manifest's name. */
export function Pwa(props: {
  readonly children: ReactNode;
  readonly prompts?: PwaPrompts;
}) {
  if (!pwaIncluded()) return props.children;
  return <PwaOn prompts={props.prompts ?? {}}>{props.children}</PwaOn>;
}

function PwaOn(props: {
  readonly children: ReactNode;
  readonly prompts: PwaPrompts;
}) {
  // The browser offers install once, early, so it is caught at the root.
  useInstall();
  return (
    <PwaProvider>
      {props.children}
      {props.prompts.update === 'reload' ? (
        <ReloadOnUpdate />
      ) : (
        <UpdatePrompt />
      )}
      {props.prompts.install !== 'off' && (
        <InstallPrompt title={`Install ${pwaName()}`} />
      )}
    </PwaProvider>
  );
}

/** Takes a new version as soon as it is ready: every open page reloads into it. */
function ReloadOnUpdate() {
  const { status, applyUpdate } = usePwa();
  useEffect(() => {
    if (status._tag === 'UpdateReady') void applyUpdate();
  }, [status._tag, applyUpdate]);
  return null;
}
