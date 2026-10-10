import type { BetterAuthPlugin } from 'better-auth';
import { createAuthMiddleware, isAPIError } from 'better-auth/api';

interface Consent {
  userId: string;
  clientId: string;
}

const isDeleteConsent = (ctx: { path?: string }) =>
  ctx.path === '/oauth2/delete-consent';

const consentId = (ctx: { body?: unknown }) =>
  (ctx.body as { id?: string } | undefined)?.id;

/** Deleting a Grant also revokes its tokens; the provider only deletes the
 * Grant. JWT access tokens still live until they expire. */
export const grantRevocation = (): BetterAuthPlugin => {
  // The Grant is gone by the after hook, so the before hook remembers it.
  const deleting = new Map<string, Consent>();
  return {
    id: 'grant-revocation',
    hooks: {
      before: [
        {
          matcher: isDeleteConsent,
          handler: createAuthMiddleware(async (ctx) => {
            const id = consentId(ctx);
            const consent =
              id &&
              (await ctx.context.adapter.findOne<Consent>({
                model: 'oauthConsent',
                where: [{ field: 'id', value: id }],
              }));
            if (id && consent) deleting.set(id, consent);
          }),
        },
      ],
      after: [
        {
          matcher: isDeleteConsent,
          handler: createAuthMiddleware(async (ctx) => {
            const id = consentId(ctx);
            const consent = id && deleting.get(id);
            if (!id || !consent) return;
            deleting.delete(id);
            if (isAPIError(ctx.context.returned)) return;
            const where = [
              { field: 'userId', value: consent.userId },
              { field: 'clientId', value: consent.clientId },
            ];
            const update = { revoked: new Date() };
            await Promise.all(
              ['oauthRefreshToken', 'oauthAccessToken'].map((model) =>
                ctx.context.adapter.updateMany({ model, where, update }),
              ),
            );
          }),
        },
      ],
    },
  };
};
