import { useRef } from 'react';
import type { ComponentType, ReactNode } from 'react';
import type { AppRuntime } from 'effect-oak/react';
import { Shell } from '../../shell/index.js';
import { Picture } from '../shapes/index.js';
import { Marbles } from './marbles.js';
import { Strip } from './strip.js';

/** An app made with `toReact`. */
type OakApp = ComponentType & { readonly useRuntime: () => AppRuntime };

/** One page component per app, so the Shell keeps the same component across renders. */
const pages = new WeakMap<OakApp, OakApp>();

/** The app drawn inside one Picture, with the Marbles over it and the Strip under it. */
const pageOf = (App: OakApp): OakApp => {
  let page = pages.get(App);
  if (!page) {
    const Page = () => {
      const picture = useRef<HTMLDivElement>(null);
      return (
        <Picture
          ref={picture}
          below={<Strip useRuntime={App.useRuntime} />}
          overlay={<Marbles useRuntime={App.useRuntime} picture={picture} />}
        >
          <App />
        </Picture>
      );
    };
    page = Object.assign(Page, { useRuntime: App.useRuntime });
    pages.set(App, page);
  }
  return page;
};

/** A concept demo in the Shell: its Picture, Strip and Marbles beside the devtools. */
export const ConceptPage = ({
  app,
  menu,
}: {
  readonly app: OakApp;
  readonly menu: ReactNode;
}) => <Shell app={pageOf(app)} menu={menu} />;
