import handler from '@tanstack/react-start/server-entry';
import type { PagesContext } from '../../auth-worker-contract/index.js';

export default async (
  request: Request,
  context: PagesContext,
): Promise<Response> => handler.fetch(request, { context });
