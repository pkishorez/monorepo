import type { PeerChannel, PeerChannelFactory } from '../peer-sync/index.js';

type BrowserBroadcastChannel = {
  postMessage(message: unknown): void;
  addEventListener(
    type: 'message',
    listener: (event: { data: unknown }) => void,
  ): void;
  removeEventListener(
    type: 'message',
    listener: (event: { data: unknown }) => void,
  ): void;
  close(): void;
};

type BroadcastChannelConstructor = new (
  name: string,
) => BrowserBroadcastChannel;

export const broadcastChannel = (): PeerChannelFactory | null => {
  const constructor = (
    globalThis as { BroadcastChannel?: BroadcastChannelConstructor }
  ).BroadcastChannel;
  if (constructor === undefined) return null;

  return (name): PeerChannel => {
    const channel = new constructor(name);
    return {
      broadcast: async (message) => {
        channel.postMessage(message);
      },
      subscribe: async (handler) => {
        let accepting = true;
        const listener = (event: { data: unknown }) => {
          if (accepting) handler(event.data);
        };
        channel.addEventListener('message', listener);
        return async () => {
          accepting = false;
          channel.removeEventListener('message', listener);
          channel.close();
        };
      },
    };
  };
};
