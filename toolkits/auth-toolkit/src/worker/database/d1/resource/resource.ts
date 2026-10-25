import * as Cloudflare from '@alchemy.run/cloudflare';
import {
  AUTH_MIGRATIONS_TABLE,
  authMigrationsDir,
} from '../../migration/index.js';

interface D1DatabaseProps {
  name?: string;
}

export const d1Database = (id: string, props: D1DatabaseProps = {}) =>
  Cloudflare.D1.Database(id, {
    ...(props.name ? { name: props.name } : {}),
    migrations: {
      dir: authMigrationsDir,
      table: AUTH_MIGRATIONS_TABLE,
    },
  });
