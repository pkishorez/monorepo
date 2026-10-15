import { AnimatePresence, motion } from 'motion/react';
import { Route, Router, useRouter } from '@kestack/kabuki/routing';
import { Start } from '@kestack/kabuki/start';
import { Pages, Routes } from '../shared/index.ts';
import { Layout, directionOf, settle, slide } from './components/index.ts';
import Document from './document.tsx';
import { BlogView } from './pages/blog/index.ts';
import { CanvasView } from './pages/canvas/index.ts';
import { FeedView } from './pages/feed/index.ts';
import { FlakyView } from './pages/flaky/index.ts';
import { HomeView } from './pages/home/index.ts';
import { NotFound } from './pages/not-found/index.ts';
import { NotesView } from './pages/notes/index.ts';
import { PreloadView } from './pages/preload/index.ts';
import { SearchView } from './pages/search/index.ts';
import { TeamView } from './pages/teams/index.ts';
import './styles.css';

/*
 * The root page's View: the layout, and the one page the URL names. A new
 * page slides in the way the move went, from the right for a push and from
 * the left for Back, while the one before pops out of the flow and fades:
 * its View keeps drawing its last data as it goes. The browser's scroll
 * anchoring is off here: it would move the window as the page going out is
 * taken away, after Kabuki put it back. A URL that names no page draws the
 * not-found page.
 */

const AppView = Route.view(Pages.App, (self) => {
  const { Home, Blog, Teams, Feed, Search, Notes, Preload, Flaky, Canvas } =
    self.children;
  const direction = directionOf(useRouter().move.how);
  const page =
    (Home && <HomeView instance={Home} />) ??
    (Blog && <BlogView instance={Blog} />) ??
    (Teams && <TeamView instance={Teams} />) ??
    (Feed && <FeedView instance={Feed} />) ??
    (Search && <SearchView instance={Search} />) ??
    (Notes && <NotesView instance={Notes} />) ??
    (Preload && <PreloadView instance={Preload} />) ??
    (Flaky && <FlakyView instance={Flaky} />) ??
    (Canvas && <CanvasView instance={Canvas} />);
  const shown =
    Home ??
    Blog ??
    Teams ??
    Feed ??
    Search ??
    Notes ??
    Preload ??
    Flaky ??
    Canvas;
  const notFound = self.props.route.notFound;
  return (
    <div {...self.root}>
      <Layout live={self.model.live}>
        <div className="relative overflow-x-clip [overflow-anchor:none]">
          <AnimatePresence mode="popLayout" initial={false} custom={direction}>
            <motion.div
              key={notFound !== null ? 'not-found' : shown?.id}
              custom={direction}
              variants={slide}
              initial="enter"
              animate="center"
              exit="exit"
              transition={settle}
            >
              {notFound !== null ? <NotFound path={notFound} /> : page}
            </motion.div>
          </AnimatePresence>
        </div>
      </Layout>
    </div>
  );
});

export default Start.app(Router.app(Routes, AppView), { document: Document });
