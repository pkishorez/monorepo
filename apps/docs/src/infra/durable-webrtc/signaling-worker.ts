import { DurableSignalingWorker } from 'effect-webrtc/signaling/durable/alchemy';

const requestOrigin = (request: Request) => {
  const origin = request.headers.get('x-durable-signaling-origin');
  if (origin === null) throw new Error('Missing signaling proxy origin');
  return origin;
};

const authWorkerUrl = (request: Request) => {
  const origin = requestOrigin(request);
  return new URL(origin).hostname.endsWith('.kishore.computer')
    ? origin
    : 'https://auth.kishore.app';
};

export default class SignalingWorker extends DurableSignalingWorker<SignalingWorker>()(
  'DurableSignalingWorker',
  {
    main: import.meta.filename,
    authWorkerUrl,
    trustedOrigins: (request) => [requestOrigin(request)],
    workersDev: false,
  },
) {}
