import { createFileRoute } from '@tanstack/react-router';
import { OpeningAnApp } from '@/demos/opening-an-app';
import { ThemeToggle } from '@/lib/theme';

export const Route = createFileRoute('/demos/opening-an-app')({
  component: () => (
    <>
      <OpeningAnApp />
      <ThemeToggle />
    </>
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
