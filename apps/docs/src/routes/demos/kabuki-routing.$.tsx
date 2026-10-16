import { createFileRoute } from '@tanstack/react-router';
import { KabukiRouting, router } from '@/demos/kabuki-routing';
import { ThemeToggle } from '@/lib/theme';

/**
 * The hand-over: TanStack matches everything under /demos/kabuki-routing
 * once, here, and the Kabuki app routes the rest itself. The title comes
 * from the app's router, worked out from the URL alone.
 */
export const Route = createFileRoute('/demos/kabuki-routing/$')({
  // The app reads its first Route from the browser's URL, so it is drawn in
  // the browser only: a server would draw every URL as the start.
  ssr: false,
  component: () => (
    <KabukiRouting
      // In the demo's header, not the page's corner, where the devtools draw their own controls.
      actions={<ThemeToggle className="-my-2 -mr-2 shrink-0" />}
    />
  ),
  head: ({ params }) => ({
    meta: [
      {
        title:
          router.metadata(`/${params._splat ?? ''}`).title ??
          'Routing · Kabuki',
      },
      {
        name: 'description',
        content:
          'A Kabuki app that routes itself, in memory or on a TanStack catch-all route: pages inside pages, a dialog with its own URL, a sign-in guard and redirects.',
      },
    ],
  }),
});
