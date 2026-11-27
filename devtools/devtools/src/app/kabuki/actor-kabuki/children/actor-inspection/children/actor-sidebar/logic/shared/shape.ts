import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';

const Tab = Schema.Literals(['world', 'chat']);

export type Tab = typeof Tab.Type;

export const SidebarShape = Actor.define('Sidebar', {
  description:
    'Beside the Inspector: World, when the app has Fakes, and Chat with the Agent',
  input: Schema.Struct({ name: Schema.String, app: Schema.String }),
  model: {
    name: Schema.String,
    app: Schema.String,
    tab: Schema.NullOr(Tab),
  },
  message: {
    Tabbed: Schema.Struct({ tab: Tab }).annotate({
      description: 'Show World or Chat',
    }),
  },
});
