import { createFileRoute } from '@tanstack/react-router';
import { DurableWebRtcPage } from '@/demos/durable-webrtc/app/durable-webrtc-page';

export const Route = createFileRoute('/demos/durable-webrtc')({
  component: DurableWebRtcPage,
  ssr: false,
  head: () => ({
    meta: [
      { title: 'Durable WebRTC — private peer-to-peer messaging' },
      {
        name: 'description',
        content:
          'Discover your authenticated devices through Durable Object signaling, then chat over direct WebRTC Data Channels.',
      },
    ],
  }),
});
