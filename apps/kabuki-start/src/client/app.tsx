import { View } from '@kestack/kabuki/react';
import { Start } from '@kestack/kabuki/start';
import { Pages, router } from '../shared/index.ts';
import { Layout } from './components/index.ts';
import Document from './document.tsx';
import { BlogView } from './pages/blog/index.ts';
import { FeedView } from './pages/feed/index.ts';
import { HomeView } from './pages/home/index.ts';
import { NotFound } from './pages/not-found/index.ts';
import { PreloadView } from './pages/preload/index.ts';
import { SearchView } from './pages/search/index.ts';
import { TeamView } from './pages/teams/index.ts';
import './styles.css';

/*
 * The root page's View: the layout, and the one page the URL names. A URL
 * that names no page draws the not-found page.
 */

const AppView = View.make(Pages.AppLive, (self) => {
  const { Home, Blog, Teams, Feed, Search, Preload } = self.children;
  const notFound = self.props.route.notFound;
  return (
    <div {...self.root}>
      <Layout live={self.model.live}>
        {notFound !== null ? (
          <NotFound path={notFound} />
        ) : (
          ((Home && <HomeView instance={Home} />) ??
          (Blog && <BlogView instance={Blog} />) ??
          (Teams && <TeamView instance={Teams} />) ??
          (Feed && <FeedView instance={Feed} />) ??
          (Search && <SearchView instance={Search} />) ??
          (Preload && <PreloadView instance={Preload} />))
        )}
      </Layout>
    </div>
  );
});

export default Start.app(router, AppView, { document: Document });
