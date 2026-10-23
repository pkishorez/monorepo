import { Schema, Stream } from 'effect';
import { AiClients } from '@kestack/ai-toolkit/client';
import { Actor } from '@kestack/kabuki';

/*
 * Each Machine's socket as it stands, followed: one Worker per Machine in
 * the list, each holding that Machine's socket while it follows it. A
 * Machine not followed yet is connecting.
 */

const Status = Schema.Literals(['connecting', 'connected', 'reconnecting']);

const Connections = Actor.define('Connections', {
  requires: [AiClients],
  props: Schema.Struct({ machineIds: Schema.Array(Schema.String) }),
  model: Schema.Struct({
    /** Each Machine's socket now, by Machine id. */
    status: Schema.Record(Schema.String, Status),
  }),
  message: Schema.TaggedUnion({
    Changed: { machineId: Schema.String, status: Status },
  }),
});

export const ConnectionsLive = Actor.build(Connections, {
  init: () => ({ model: { status: {} } }),
  workers: {
    follow: {
      each: ({ props }) => props.machineIds,
      run: (self, machineId) =>
        Stream.runForEach(AiClients.connection(machineId), (status) =>
          self.send({ _tag: 'Changed', machineId, status }),
        ),
    },
  },
  on: {
    Changed: ({ machineId, status }, { model }) => ({
      model: { status: { ...model.status, [machineId]: status } },
    }),
  },
});
