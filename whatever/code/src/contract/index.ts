import { RpcSerialization } from 'effect/unstable/rpc';
import { CodeRpcs } from './code/index.js';
import { HelloRpcs } from './hello/index.js';

export { CodeRpcError } from './code/index.js';

export const WhateverRpcSerialization = RpcSerialization.layerJson;

export const WhateverRpcs = HelloRpcs.merge(CodeRpcs);
