import { View } from '@kestack/kabuki/react';
import { Page, Router } from '@kestack/kabuki/routing';
import { TodosPage, TodosPageLive, TodosPageView } from './todos/page.tsx';
import { Body } from './view.tsx';

export const Playground = Page.define({ pages: { Todos: TodosPage } });

export const PlaygroundLive = Playground.build({
  pages: { Todos: TodosPageLive },
});

export const router = Router.define(Playground, {
  notFound: { title: 'Not found · Kabuki Playground', robots: 'noindex' },
});

export const PlaygroundView = View.make(PlaygroundLive, ({ children }) => (
  <Body
    page={children.Todos ? <TodosPageView instance={children.Todos} /> : null}
  />
));
