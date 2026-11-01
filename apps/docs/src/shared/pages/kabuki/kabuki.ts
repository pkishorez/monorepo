import { Page } from '@kestack/kabuki/routing';
import { about, packageOf } from '../../content/index.ts';
import {
  Demo,
  DemoLive,
  SnakeRecord,
  SnakeRecordLive,
  StageDemo,
  StageDemoLive,
  TodosDemo,
  TodosDemoLive,
} from './demo.ts';
import { Doc, DocLive } from './doc.ts';

/*
 * kabuki: its landing page when the URL ends here, a docs page under it,
 * or one of the full-screen demos.
 */

export const Kabuki = Page.define({
  path: '/kabuki',
  metadata: about('/kabuki', 'kabuki', packageOf('kabuki').pitch),
  pages: { Doc, Demo, TodosDemo, StageDemo, SnakeRecord },
});

export const KabukiLive = Kabuki.build({
  pages: {
    Doc: DocLive,
    Demo: DemoLive,
    TodosDemo: TodosDemoLive,
    StageDemo: StageDemoLive,
    SnakeRecord: SnakeRecordLive,
  },
});
