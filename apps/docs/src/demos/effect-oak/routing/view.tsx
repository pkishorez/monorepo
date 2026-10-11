import { View } from 'effect-oak/react';
import type { ViewProps } from 'effect-oak/react';
import { FilesIndexPage, FilesPage } from './files/index.js';
import { Frame, HomePage, NestedPage, NotFoundPage } from './pages.js';
import { PeopleView, PersonPage } from './people/index.js';
import { Routing } from './routing.js';

type Go = (path: string) => void;

/** The page for the route the root is on. */
const pageFor = (self: ViewProps<typeof Routing>, go: Go) => {
  switch (self._tag) {
    case 'Opening':
      return null;
    case 'Home':
      return <HomePage onNavigate={go} />;
    case 'Nested':
      return <NestedPage />;
    case 'People':
      return <PeopleView instance={self.children.people} />;
    case 'Person':
      return <PersonPage personId={self.state.personId} onNavigate={go} />;
    case 'FilesIndex':
      return <FilesIndexPage onNavigate={go} />;
    case 'Files':
      return <FilesPage path={self.state.path} onNavigate={go} />;
    case 'NotFound':
      return <NotFoundPage path={self.state.path} onNavigate={go} />;
  }
};

/** One route's page inside the frame, its links Sending `ClickedLink`. */
export const RoutingView = View.make(Routing, (self) => {
  if (self._tag === 'Opening') return null;
  const go = (path: string) => self.send({ _tag: 'ClickedLink', path });
  return (
    <Frame route={self._tag} path={self.model.path} onNavigate={go}>
      {pageFor(self, go)}
    </Frame>
  );
});
