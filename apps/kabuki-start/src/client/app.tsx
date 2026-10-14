import { Route, Router } from '@kestack/kabuki/routing';
import { Start } from '@kestack/kabuki/start';
import { Pages, Routes } from '../shared/index.ts';
import { Layout, enter } from './components/index.ts';
import Document from './document.tsx';
import { BlogView } from './pages/blog/index.ts';
import { FlakyView } from './pages/flaky/index.ts';
import { HomeView } from './pages/home/index.ts';
import { NotFound } from './pages/not-found/index.ts';
import { NotesView } from './pages/notes/index.ts';
import { PreloadView } from './pages/preload/index.ts';
import { SearchView } from './pages/search/index.ts';
import { TeamView } from './pages/teams/index.ts';
import './styles.css';

/*
 * The root page's View: the layout, and the one page the URL names, which
 * fades up into place. A URL that names no page draws the not-found page.
 */

const AppView = Route.view(Pages.App, (self) => {
  const { Home, Blog, Teams, Search, Notes, Preload, Flaky } = self.children;
  const page =
    (Home && <HomeView instance={Home} />) ??
    (Blog && <BlogView instance={Blog} />) ??
    (Teams && <TeamView instance={Teams} />) ??
    (Search && <SearchView instance={Search} />) ??
    (Notes && <NotesView instance={Notes} />) ??
    (Preload && <PreloadView instance={Preload} />) ??
    (Flaky && <FlakyView instance={Flaky} />);
  const shown = Home ?? Blog ?? Teams ?? Search ?? Notes ?? Preload ?? Flaky;
  return (
    <div {...self.root}>
      <Layout live={self.model.live}>
        {self.props.route.notFound !== null ? (
          <NotFound path={self.props.route.notFound} />
        ) : (
          <div key={shown?.id} className={enter}>
            {page}
          </div>
        )}
      </Layout>
    </div>
  );
});

export default Start.app(Router.app(Routes, AppView), { document: Document });
