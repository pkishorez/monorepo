// Server and frontend clients share this complete DevTools RPC contract.
export { DevtoolsRpc } from './rpc.js';
// Telemetry handlers use this for unexpected query failures.
export { DevtoolsRpcError } from './rpc.js';
// Trace consumers distinguish a valid lookup with no stored trace.
export { TraceNotFound } from './rpc.js';
// Laymos consumers distinguish unsupported and unavailable Project paths.
export { InvalidProjectPath } from './rpc.js';
// Laymos consumers distinguish a Config that cannot be read.
export { ConfigReadError } from './rpc.js';
// Laymos consumers distinguish invalid Config JSON.
export { ConfigParseError } from './rpc.js';
// Laymos consumers distinguish a Config that fails its runtime schema.
export { ConfigSchemaError } from './rpc.js';
// Laymos consumers receive every semantic Config validation issue.
export { ConfigValidationError } from './rpc.js';
// Laymos consumers distinguish a failure to analyze supported source files.
export { SourceAnalysisError } from './rpc.js';
