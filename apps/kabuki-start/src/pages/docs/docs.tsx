import { Actor } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kestack/web-platform/components/card';
import { Page, Provenance, link, tile } from '../../parts/index.ts';
import { Routes } from '../../routes.ts';
import { Playground } from './playground.ts';

/*
 * The docs: the index of pages, a static parent with its own Loader, and
 * the page the URL names, whose Loader runs at the same time. The index is
 * the docs' own View, from its own Input; the playground under it is drawn
 * in the browser alone.
 */

const pages = Routes.Docs.outlet({
  Index: () => null,
  Playground,
  Page: (_props, doc) => (
    <Page
      place="Docs.Page"
      loadedAt={doc.loadedAt}
      title={doc.title}
      intro={doc.summary}
    >
      <div className="max-w-prose space-y-4 text-[0.9375rem] leading-7">
        {doc.body.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
      <Router.Link to={Routes.Docs.Index()} className={`${link} text-sm`}>
        All docs
      </Router.Link>
    </Page>
  ),
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
      <Page
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
      </Page>
    ) : (
      <pages.View of={self} />
    )}
    <Provenance place="Docs" loadedAt={self.model.loadedAt} />
  </div>
));

export const Docs = { actor: DocsActor, view: DocsView };
