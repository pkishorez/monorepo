import { Effect } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';
import {
  Credentials,
  apiTokenCredentials,
} from '@distilled.cloud/cloudflare/Credentials';
import { getZone } from '@distilled.cloud/cloudflare/zones';

export const verifyZones = (
  connection: { accountId: string; apiToken: string },
  row: { props?: unknown; attr?: unknown },
) => {
  const zones = new Set<string>();
  const collect = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if ((key === 'zoneId' || key === 'zone_id') && typeof item === 'string')
        zones.add(item);
      else collect(item);
    }
  };
  collect(row.props);
  collect(row.attr);
  return Effect.forEach(
    [...zones],
    (zoneId) =>
      getZone({ zoneId }).pipe(
        Effect.flatMap((zone) =>
          zone.account.id?.toLowerCase() === connection.accountId.toLowerCase()
            ? Effect.void
            : Effect.fail(new Error('Cloudflare account mismatch')),
        ),
      ),
    { concurrency: 4 },
  ).pipe(
    Effect.provideService(
      Credentials,
      Effect.succeed(apiTokenCredentials({ apiToken: connection.apiToken })),
    ),
    Effect.provide(FetchHttpClient.layer),
    Effect.provideService(FetchHttpClient.RequestInit, { redirect: 'manual' }),
  );
};
