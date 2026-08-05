// Service tag callers yield to obtain the config service. Also exposes the
// static `jsonSchema()` for the published JSON Schema of laymos.config.json.
export { ConfigService } from './config.js';
// Live layer providing ConfigService via the platform FileSystem.
export { ConfigServiceLive } from './config.js';
// Decoded config shape.
export type { Config } from './config.js';
// Tagged error callers pattern-match on when a read fails.
export { ConfigError } from './errors.js';
