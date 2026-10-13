import { createFileRoute } from '@tanstack/react-router';
import { OpeningAnApp } from '@/demos/opening-an-app';
import { ThemeToggle } from '@/lib/theme';

export const Route = createFileRoute('/demos/opening-an-app')({
  component: () => (
    <OpeningAnApp
      // In the demo's header, not the page's corner, where the devtools draw their own controls.
      actions={<ThemeToggle className="-mr-2 shrink-0" />}
    />
  ),
  head: () => ({
    meta: [
      { title: 'Opening an app · Kabuki' },
      {
        name: 'description',
        content:
          'An app opening, drawn as the tree of Kabuki Actors it is: States, Children, Workers, Commands and Capabilities, with Time Travel.',
      },
    ],
  }),
});
