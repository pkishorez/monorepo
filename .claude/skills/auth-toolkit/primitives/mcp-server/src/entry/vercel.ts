import { requiredScopes } from '../../infra/config.ts';
import { createResourceServer } from '../resource-server/index.ts';

// Vercel Functions speak Web-standard Request/Response. Place this file at
// `api/[[...path]].ts` (or re-export it from there) and set AUTH_URL and
// MCP_RESOURCE in the project's environment. Nothing else is needed.
const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set in the environment.`);
  return value;
};

const server = createResourceServer({
  authWorkerUrl: required('AUTH_URL'),
  resource: required('MCP_RESOURCE'),
  requiredScopes,
});

const handle = (request: Request): Promise<Response> => server(request);

export const GET = handle;
export const HEAD = handle;
export const POST = handle;
export const DELETE = handle;
export const OPTIONS = handle;
