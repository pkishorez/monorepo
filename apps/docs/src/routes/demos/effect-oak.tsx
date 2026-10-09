import { createFileRoute } from '@tanstack/react-router';
import { EffectOakDemo } from '@/demos/effect-oak';

export const Route = createFileRoute('/demos/effect-oak')({
  component: EffectOakDemo,
  ssr: false,
  head: () => ({
    meta: [
      { title: 'Effect Oak Demo' },
      {
        name: 'description',
        content:
          'An auth gate and a todo list built as one tree of Effect Oak Nodes, with its Message Log beside it.',
      },
    ],
    styles: [{ children: 'body { overflow: hidden; }' }],
  }),
});
