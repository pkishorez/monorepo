import { View } from '@kestack/kabuki/react';
import { Pages } from '../../../shared/index.ts';
import {
  ActorStoryView,
  DemoView,
  SnakeRecordView,
  StageDemoView,
  TodosDemoView,
} from './demo.tsx';
import { DocView } from './doc.tsx';
import { Landing } from './landing/landing.tsx';

/*
 * kabuki's place: the landing page when the URL ends here, or a docs page,
 * or a demo full screen, which the root draws outside the site's layout.
 */

export const KabukiView = View.make(Pages.KabukiLive, (self) => {
  const {
    Doc: doc,
    Demo: demo,
    TodosDemo: todos,
    StageDemo: stage,
    SnakeRecord: record,
    ActorStory: story,
  } = self.children;
  if (story) return <ActorStoryView instance={story} />;
  if (demo) return <DemoView instance={demo} />;
  if (todos) return <TodosDemoView instance={todos} />;
  if (stage) return <StageDemoView instance={stage} />;
  if (record) return <SnakeRecordView instance={record} />;
  if (!doc) return <Landing />;
  return <DocView instance={doc} />;
});
