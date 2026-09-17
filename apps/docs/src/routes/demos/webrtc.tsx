import { createFileRoute } from '@tanstack/react-router';
import { DurableWebRtcPage } from '@/demos/durable-webrtc/app/durable-webrtc-page';
import { EffectWebRtcPage } from '@/demos/effect-webrtc/app/effect-webrtc-page';

export const Route = createFileRoute('/demos/webrtc')({
  component: WebRtcPage,
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    transport:
      search.transport === 'nostr' ? ('nostr' as const) : ('durable' as const),
  }),
  head: () => ({
    meta: [
      { title: 'WebRTC Chat — direct peer-to-peer messaging' },
      {
        name: 'description',
        content:
          'Chat directly over WebRTC using Nostr or an authenticated Durable Object to discover peers.',
      },
    ],
  }),
});

function WebRtcPage() {
  const { transport } = Route.useSearch();
  return transport === 'nostr' ? <EffectWebRtcPage /> : <DurableWebRtcPage />;
}
