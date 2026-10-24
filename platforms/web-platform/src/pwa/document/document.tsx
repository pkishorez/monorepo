import type { ReactNode } from 'react';
import { InstallPrompt, useInstall } from '../extras/index.js';
import { PwaProvider, pwaHead, UpdatePrompt } from '../react/index.js';

/*
 * The PWA in a Kabuki Start app's Document: `PwaHead` in its `head`, and
 * `Pwa` around the app. Together they put the manifest, the Apple icon and
 * the Build ID in every page's head, register the worker after mount, show
 * the Update Prompt while a new version waits, and offer install once.
 * Leave them out and the app is no PWA.
 */

/** The manifest link, the Apple icon and the Build ID tags, for the Document's `head`. */
export function PwaHead() {
  const { meta, links } = pwaHead();
  return (
    <>
      {meta.map((tag) => (
        <meta key={tag.name} {...tag} />
      ))}
      {links.map((link) => (
        <link key={link.rel} {...link} />
      ))}
    </>
  );
}

/** Around the app: the worker, the Update Prompt and the Install Prompt. */
export function Pwa(props: {
  /** The Install Prompt's title. Default: `Install this app`. */
  readonly installTitle?: string;
  readonly children: ReactNode;
}) {
  // The browser offers install once, early, so it is caught at the root.
  useInstall();
  return (
    <PwaProvider>
      {props.children}
      <UpdatePrompt />
      <InstallPrompt
        {...(props.installTitle === undefined
          ? {}
          : { title: props.installTitle })}
      />
    </PwaProvider>
  );
}
