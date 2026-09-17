import * as NodeRuntime from '@effect/platform-node/NodeRuntime';
import * as NodeServices from '@effect/platform-node/NodeServices';
import { Effect } from 'effect';
import { runNodePeer } from './demos/effect-webrtc/node/index.ts';

NodeRuntime.runMain(runNodePeer.pipe(Effect.provide(NodeServices.layer)));
