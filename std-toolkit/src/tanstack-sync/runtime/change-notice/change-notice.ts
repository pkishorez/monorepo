export type ChangeNoticeChannel = {
  postMessage: (data: unknown) => void;
  close: () => void;
  onmessage: ((event: { data: unknown }) => void) | null;
};

export type ChannelFactory = (name: string) => ChangeNoticeChannel;

export type ChangeNotice = {
  notify: () => void;
  close: () => void;
};

const globalFactory = (): ChannelFactory | null => {
  const ctor = (
    globalThis as {
      BroadcastChannel?: new (name: string) => ChangeNoticeChannel;
    }
  ).BroadcastChannel;
  return ctor === undefined ? null : (name) => new ctor(name);
};

export const makeChangeNotice = (args: {
  scope: string;
  collection: string;
  onNotice: () => void;
  channel?: ChannelFactory | undefined;
}): ChangeNotice => {
  const factory = args.channel ?? globalFactory();
  if (factory === null) return { notify: () => {}, close: () => {} };

  const channel = factory(`${args.scope}:${args.collection}`);
  let scheduled: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  // Coalesced on receive: a burst of notices advances one Projection Position once.
  channel.onmessage = () => {
    if (closed || scheduled !== null) return;
    scheduled = setTimeout(() => {
      scheduled = null;
      if (!closed) args.onNotice();
    }, 0);
  };

  return {
    notify: () => {
      if (!closed) channel.postMessage(args.collection);
    },
    close: () => {
      closed = true;
      if (scheduled !== null) clearTimeout(scheduled);
      channel.onmessage = null;
      channel.close();
    },
  };
};
