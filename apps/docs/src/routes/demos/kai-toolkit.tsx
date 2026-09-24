import { createFileRoute } from '@tanstack/react-router';
import { KaiToolkitPlayground } from '@/demos/kai-toolkit/app';

export const Route = createFileRoute('/demos/kai-toolkit')({
  component: KaiToolkitPlayground,
  ssr: false,
  head: () => ({
    meta: [
      { title: 'KAI Toolkit Playground' },
      {
        name: 'description',
        content:
          'Run Claude and Codex through the typed KAI Toolkit playground.',
      },
    ],
    styles: [{ children: 'body { overflow: hidden; }' }],
  }),
});
