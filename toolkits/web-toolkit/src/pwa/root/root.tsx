import type { ReactNode } from 'react';
import type { RootPlugin } from '../../client/index.ts';
import { InstallPrompt, useInstall } from '../extras/index.js';
import { PwaProvider, pwaHead, UpdatePrompt } from '../react/index.js';
import { splashHead } from '../splash/index.ts';

/**
 * The PWA, plugged into the root document: the manifest, icons, Build ID
 * and iOS splash tags in every page's head; the service worker registered
 * after mount; the Update Prompt when a new version waits; and the Install
 * Prompt, offered once. Leave it out and the app is no PWA.
 */
export const pwaRoot = (
  options: { readonly installTitle?: string } = {},
): RootPlugin => ({
  head: () => {
    const pwa = pwaHead();
    const splash = splashHead();
    return {
      meta: [...pwa.meta, ...splash.meta],
      links: [...pwa.links, ...splash.links],
    };
  },
  Provider: (props: { readonly children: ReactNode }) => {
    // The browser offers install once, early, so it is caught at the root.
    useInstall();
    return (
      <PwaProvider>
        {props.children}
        <UpdatePrompt />
        <InstallPrompt
          {...(options.installTitle === undefined
            ? {}
            : { title: options.installTitle })}
        />
      </PwaProvider>
    );
  },
});
