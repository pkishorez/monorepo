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
          'Find Peers through free public Nostr relays, then exchange messages over real browser WebRTC Data Channels.',
      },
    ],
  }),
});
