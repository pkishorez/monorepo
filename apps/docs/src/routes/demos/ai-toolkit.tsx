import { createFileRoute } from '@tanstack/react-router';
import { AiToolkitPlayground } from '@/demos/ai-toolkit/app';

export const Route = createFileRoute('/demos/ai-toolkit')({
  component: AiToolkitPlayground,
  ssr: false,
  head: () => ({
    meta: [
      { title: 'AI Toolkit Playground' },
      {
        name: 'description',
        content:
          'Run Claude and Codex through the typed AI Toolkit playground.',
      },
    ],
    styles: [{ children: 'body { overflow: hidden; }' }],
  }),
});
