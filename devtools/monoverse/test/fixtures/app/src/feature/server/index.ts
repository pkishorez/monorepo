import { handlers } from './rpc/feature/real/index.ts';
import { ingest } from './http/otlp/real/index.ts';
import { dbLayer } from './services/db/real/index.ts';
export const server = [handlers, ingest, dbLayer];
