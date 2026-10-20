import { View } from '@kestack/kabuki/react';
import { Start } from '@kestack/kabuki/start';
import { Pages, router } from '../shared/index.ts';
import { Layout } from './components/index.ts';
import Document from './document.tsx';
import { HomeView } from './pages/home/index.ts';
import { KabukiView } from './pages/kabuki/index.ts';
import { NotFound } from './pages/not-found/index.ts';
import './styles.css';

/*
 * The root page's View: the one toolkit's place the URL names, in the
 * site's layout. The full-screen demos are drawn alone, with no layout. A URL
 * that names no page draws the not-found page.
 */

const AppView = View.make(Pages.AppLive, (self) => {
  const { Home, Kabuki } = self.children;
  const { route } = self.props;
  if (
    Kabuki &&
    route.page?._tag === 'Kabuki' &&
    (route.page.page?._tag === 'Demo' ||
      route.page.page?._tag === 'TodosDemo' ||
      route.page.page?._tag === 'StageDemo' ||
      route.page.page?._tag === 'SnakeRecord')
  )
    return <KabukiView instance={Kabuki} />;
  return (
    <div {...self.root}>
      <Layout>
        {route.notFound !== null ? (
          <NotFound path={route.notFound} />
        ) : (
          ((Home && <HomeView instance={Home} />) ??
          (Kabuki && <KabukiView instance={Kabuki} />))
        )}
      </Layout>
    </div>
  );
});

export default Start.app({ router, view: AppView, document: Document });
