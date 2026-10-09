import { createFileRoute } from '@tanstack/react-router';
import { EffectOakDemo } from '@/demos/effect-oak';
import { DemoMenu } from '@/lib/demos';

export const Route = createFileRoute('/demos/effect-oak')({
  component: () => (
    <EffectOakDemo menu={<DemoMenu current="/demos/effect-oak" />} />
  ),
  ssr: false,
  head: () => ({
    meta: [
      { title: 'Road · Effect Oak' },
      {
        name: 'description',
        content:
          'A two-lane road built as an Effect Oak Node, drawn as SVG at every frame, with its Message Log and a timeline beside it.',
      },
    ],
    styles: [{ children: 'body { overflow: hidden; }' }],
  }),
});
