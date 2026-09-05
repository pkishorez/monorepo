import * as Cloudflare from 'alchemy/Cloudflare';
import {
  AUTH_MIGRATIONS_TABLE,
  authMigrationsDir,
} from '../../migration/index.js';

interface D1PrimaryDatabaseProps {
  name?: string;
}

export const d1PrimaryDatabaseResource = (
  id: string,
  props: D1PrimaryDatabaseProps = {},
) =>
  Cloudflare.D1.Database(id, {
    ...(props.name ? { name: props.name } : {}),
    migrationsDir: authMigrationsDir,
    migrationsTable: AUTH_MIGRATIONS_TABLE,
  });
