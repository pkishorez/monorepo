import handler from '@tanstack/react-start/server-entry';
import type { Branding } from '../ui/shell/index.js';

export interface PagesContext {
  branding: Branding;
}

export default async (
  request: Request,
  context: PagesContext,
): Promise<Response> => handler.fetch(request, { context });
