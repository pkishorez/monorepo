import { Effect } from 'effect';
import { initFlow } from '@pkishorez/effect-tracer/flow';
import type { FlowScenario } from './scenarios';

const webrtc = (): FlowScenario => ({
  id: 'webrtc-call-123',
  title: 'WebRTC offer and answer',
  program: () => {
    const clientA = initFlow({
      id: 'webrtc-call-123',
      participantName: 'client-a',
      participants: ['signaling-server', 'client-b'] as const,
    });
    const server = initFlow({
      id: 'webrtc-call-123',
      participantName: 'signaling-server',
      participants: ['client-a', 'client-b'] as const,
    });
    const clientB = initFlow({
      id: 'webrtc-call-123',
      participantName: 'client-b',
      participants: ['signaling-server', 'client-a'] as const,
    });
    return Effect.gen(function* () {
      yield* Effect.sleep('4 millis').pipe(
        Effect.withSpan('peer-connection.create'),
        clientA.withSpan('Create offer'),
      );
      yield* clientA.send('signaling-server', 'Send SDP offer');
      yield* Effect.sleep('3 millis').pipe(server.withSpan('Authorize call'));
      yield* server.send('client-b', 'Forward SDP offer');
      yield* Effect.sleep('5 millis').pipe(clientB.withSpan('Create answer'));
      yield* clientB.send('signaling-server', 'Send SDP answer');
      yield* server.send('client-a', 'Forward SDP answer');
      yield* clientA.log('Remote description installed');
      yield* clientB.log('ICE connection established');
      yield* clientA.end('completed', { message: 'Peer call connected' });
    });
  },
});

const chatModeration = (): FlowScenario => ({
  id: 'chat-message-204',
  title: 'Chat message moderation',
  program: () => {
    const alice = initFlow({
      id: 'chat-message-204',
      participantName: 'alice',
      participants: ['chat-server'] as const,
    });
    const chat = initFlow({
      id: 'chat-message-204',
      participantName: 'chat-server',
      participants: ['moderator', 'bob'] as const,
    });
    const moderator = initFlow({
      id: 'chat-message-204',
      participantName: 'moderator',
      participants: ['chat-server'] as const,
    });
    const bob = initFlow({
      id: 'chat-message-204',
      participantName: 'bob',
    });
    return Effect.gen(function* () {
      yield* Effect.sleep('2 millis').pipe(alice.withSpan('Compose message'));
      yield* alice.send('chat-server', 'Publish message');
      yield* Effect.sleep('3 millis').pipe(chat.withSpan('Persist message'));
      yield* chat.send('moderator', 'Request content review');
      yield* Effect.sleep('4 millis').pipe(
        moderator.withSpan('Classify content'),
      );
      yield* moderator.send('chat-server', 'Content approved');
      yield* chat.send('bob', 'Deliver message');
      yield* bob.log('Unread count incremented');
      yield* chat.end('completed', { message: 'Message delivered' });
    });
  },
});

const tokenRefresh = (): FlowScenario => ({
  id: 'token-refresh-88',
  title: 'Expired token refresh',
  program: () => {
    const browser = initFlow({
      id: 'token-refresh-88',
      participantName: 'browser',
      participants: ['api', 'identity-provider'] as const,
    });
    const api = initFlow({
      id: 'token-refresh-88',
      participantName: 'api',
      participants: ['browser'] as const,
    });
    const identity = initFlow({
      id: 'token-refresh-88',
      participantName: 'identity-provider',
      participants: ['browser'] as const,
    });
    return Effect.gen(function* () {
      yield* browser.send('api', 'Request protected resource');
      yield* Effect.sleep('2 millis').pipe(
        api.withSpan('Validate access token'),
      );
      yield* api.send('browser', '401 token expired');
      yield* browser.log('Refresh required', { level: 'warning' });
      yield* browser.send('identity-provider', 'Exchange refresh token');
      yield* Effect.sleep('4 millis').pipe(identity.withSpan('Rotate tokens'));
      yield* identity.send('browser', 'Issue new access token');
      yield* browser.send('api', 'Retry protected request');
      yield* Effect.sleep('2 millis').pipe(api.withSpan('Load profile'));
      yield* browser.end('completed', { message: 'Session restored' });
    });
  },
});

export const communicationScenarios = [
  webrtc(),
  chatModeration(),
  tokenRefresh(),
] as const;
