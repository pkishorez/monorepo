import { createFileRoute } from '@tanstack/react-router';
import { EffectWebRtcPage } from '@/demos/effect-webrtc/app/effect-webrtc-page';

export const Route = createFileRoute('/demos/effect-webrtc')({
  component: EffectWebRtcPage,
  ssr: false,
  head: () => ({
    meta: [
      { title: 'Effect WebRTC — real peer-to-peer messaging' },
      {
        name: 'description',
        content:
          'Connect Alice and Bob with in-memory signaling, then exchange messages over a real browser WebRTC Data Channel.',
      },
    ],
  }),
});
