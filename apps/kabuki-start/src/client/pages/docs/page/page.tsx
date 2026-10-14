import { Router } from '@kestack/kabuki/routing';
import { Routes } from '../../../../shared/index.ts';
import { PageFrame, link } from '../../../components/index.ts';

/*
 * One page of the docs, the one the URL names: static, its Loader run at
 * the same time as the docs' own.
 */

type DocInput = typeof Routes.Docs.Page.input.Type;

export const DocPage = (_props: unknown, doc: DocInput) => (
  <PageFrame
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
  </PageFrame>
);
