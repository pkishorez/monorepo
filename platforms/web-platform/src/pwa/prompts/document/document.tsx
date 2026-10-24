import type { ReactNode } from 'react';
import { InstallPrompt, useInstall } from '../extras/index.js';
import {
  PwaProvider,
  pwaHead,
  pwaIncluded,
  pwaName,
  UpdatePrompt,
} from '../react/index.js';

/*
 * The PWA in a Kabuki Start app's Document: `PwaHead` in its `head`, and
 * `Pwa` around the app. Together they put the manifest, the Apple icon and
 * the Build ID in every page's head, register the worker after mount, show
 * the Update Prompt while a new version waits, and offer install once.
 * In a build with `noPwa()` both draw nothing of their own.
 */

/** The manifest link, the Apple icon and the Build ID tags, for the Document's `head`. */
export function PwaHead() {
  if (!pwaIncluded()) return null;
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

/** Around the app: the worker, the Update Prompt and the Install Prompt, titled with the manifest's name. */
export function Pwa(props: { readonly children: ReactNode }) {
  if (!pwaIncluded()) return props.children;
  return <PwaOn>{props.children}</PwaOn>;
}

function PwaOn(props: { readonly children: ReactNode }) {
  // The browser offers install once, early, so it is caught at the root.
  useInstall();
  return (
    <PwaProvider>
      {props.children}
      <UpdatePrompt />
      <InstallPrompt title={`Install ${pwaName()}`} />
    </PwaProvider>
  );
}
