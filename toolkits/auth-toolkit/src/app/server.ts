import handler from '@tanstack/react-start/server-entry';
import type {
  Branding,
  ScopeDescriptions,
} from 'kui-toolkit/components/blocks/auth';

export interface PagesContext {
  branding: Branding;
  authorizationServer?: { scopes: ScopeDescriptions } | undefined;
}

export default async (
  request: Request,
  context: PagesContext,
): Promise<Response> => handler.fetch(request, { context });
