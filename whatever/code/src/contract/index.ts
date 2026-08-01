// The full merged rpc group servers serve and clients call.
export { WhateverRpcs } from './contract.js';
// Both ends must agree on the wire encoding.
export { WhateverRpcSerialization } from './contract.js';
// Handlers implement each sub-group individually.
export { CodeRpcs, HelloRpcs } from './contract.js';
// Handlers construct it to fail RPCs; clients match on it to handle failures.
export { CodeRpcError } from './contract.js';
