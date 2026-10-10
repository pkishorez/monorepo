import type { ReactNode } from 'react';
import { View } from 'effect-oak/react';
import { FilesIndexPage, FilesPage } from './files/index.js';
import { Frame, HomePage, NestedPage, NotFoundPage } from './pages.js';
import { PeopleView, PersonPage } from './people/index.js';
import { Routing } from './routing.js';

type Drawn = {
  readonly model: { readonly path: string };
  readonly state: { readonly _tag: string };
  readonly send: (message: {
    readonly _tag: 'ClickedLink';
    readonly path: string;
  }) => void;
};

/** One route's page inside the frame, its links Sending `ClickedLink`. */
const page =
  <P extends Drawn>(
    draw: (props: P, go: (path: string) => void) => ReactNode,
  ) =>
  (props: P) => {
    const go = (path: string) => props.send({ _tag: 'ClickedLink', path });
    return (
      <Frame route={props.state._tag} path={props.model.path} onNavigate={go}>
        {draw(props, go)}
      </Frame>
    );
  };

export const RoutingView = View.make(Routing, {
  Opening: () => null,
  Home: page((_, go) => <HomePage onNavigate={go} />),
  Nested: page(() => <NestedPage />),
  People: page(({ children }) => <PeopleView node={children.people} />),
  Person: page(({ state }, go) => (
    <PersonPage personId={state.personId} onNavigate={go} />
  )),
  FilesIndex: page((_, go) => <FilesIndexPage onNavigate={go} />),
  Files: page(({ state }, go) => (
    <FilesPage path={state.path} onNavigate={go} />
  )),
  NotFound: page(({ state }, go) => (
    <NotFoundPage path={state.path} onNavigate={go} />
  )),
});
