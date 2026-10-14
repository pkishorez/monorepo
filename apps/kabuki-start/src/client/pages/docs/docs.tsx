import { Actor } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kestack/web-platform/components/card';
import { PageFrame, Provenance, tile } from '../../components/index.ts';
import { Routes } from '../../../shared/index.ts';
import { DocPage } from './page/index.ts';
import { Playground } from './playground/index.ts';

/*
 * The docs: the index of pages, a static parent with its own Loader, and
 * the page the URL names, whose Loader runs at the same time. The index is
 * the docs' own View, from its own Input; the playground under it is drawn
 * in the browser alone.
 */

const pages = Routes.Docs.outlet({
  Index: () => null,
  Playground,
  Page: DocPage,
});

const DocsActor = Actor.make('Docs', {
  input: Routes.Docs.input,
  props: Routes.Docs.props,
  model: Routes.Docs.input,
}).build({
  init: (index) => ({ model: index }),
  children: pages.children,
  invoke: pages.invoke,
});

const DocsView = View.make(DocsActor, (self) => (
  <div {...self.root} className="space-y-10">
    {self.props.page._tag === 'Index' ? (
      <PageFrame
        place="Docs.Index"
        title="Docs"
        intro="Pick a page. Loading one runs its Loader and the index's at once, on the server for the first page and through one request after."
      >
        <ul className="grid gap-3 sm:grid-cols-2">
          {self.model.pages.map((page) => (
            <li key={page.slug}>
              <Router.Link
                to={Routes.Docs.Page({ page: page.slug })}
                className={tile}
              >
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>{page.title}</CardTitle>
                    <CardDescription className="font-mono text-xs">
                      /docs/{page.slug}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Router.Link>
            </li>
          ))}
          <li>
            <Router.Link to={Routes.Docs.Playground()} className={tile}>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Playground</CardTitle>
                  <CardDescription className="font-mono text-xs">
                    /docs/playground
                  </CardDescription>
                </CardHeader>
              </Card>
            </Router.Link>
          </li>
        </ul>
      </PageFrame>
    ) : (
      <pages.View of={self} />
    )}
    <Provenance place="Docs" loadedAt={self.model.loadedAt} />
  </div>
));

export const Docs = { actor: DocsActor, view: DocsView };
