import { Effect, Layer, Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import { layer as memoryPlatform } from 'effect-webrtc/platform/memory';
import { layer as memorySignaling } from 'effect-webrtc/signaling/memory';

export const memoryWebRtc = Layer.merge(memorySignaling, memoryPlatform);

const GetProfile = Rpc.make('GetProfile', {
  payload: {},
  success: Schema.Struct({ name: Schema.String, status: Schema.String }),
});

export const Profiles = RpcGroup.make(GetProfile);

export const profileHandlers = (name: string) =>
  Profiles.toLayer({
    GetProfile: () => Effect.succeed({ name, status: 'online' }),
  });

export const WatchActivity = Rpc.make('WatchActivity', {
  success: Schema.String,
  stream: true,
});

export const Activity = RpcGroup.make(WatchActivity);
