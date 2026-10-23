import { Schema, Stream } from 'effect';
import { connection } from '@kestack/ai-toolkit/client';
import { Actor } from '@kestack/kabuki';
import { connection as RpcConnection } from '@kestack/rpc-toolkit/rpc/websocket';

/*
 * The Machine's socket as it stands, followed: a Child of the Machine
 * page, since the socket is what the page Provides below it.
 */

const Status = Schema.Literals(['connecting', 'connected', 'reconnecting']);

const Socket = Actor.define('Socket', {
  requires: [RpcConnection],
  model: Schema.Struct({ status: Status }),
  message: Schema.TaggedUnion({ Changed: { status: Status } }),
});

export const SocketLive = Actor.build(Socket, {
  init: () => ({ model: { status: 'connecting' } }),
  workers: {
    follow: {
      run: (self) =>
        Stream.runForEach(connection, (status) =>
          self.send({ _tag: 'Changed', status }),
        ),
    },
  },
  on: { Changed: ({ status }) => ({ model: { status } }) },
});
