import { Context, Effect, FileSystem, Layer } from 'effect';

import {
  decodeProjectConfig,
  projectConfigJsonSchema,
  type Config,
  validateConfig,
} from '../../domain/project-config/index.js';
import { ConfigError } from './errors.js';

export class ConfigService extends Context.Service<
  ConfigService,
  {
    readonly read: (filePath: string) => Effect.Effect<Config, ConfigError>;
  }
>()('ConfigService') {
  static jsonSchema(): Readonly<Record<string, unknown>> {
    return projectConfigJsonSchema();
  }
}

export const ConfigServiceLive = Layer.effect(
  ConfigService,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    return {
      read: (filePath: string) =>
        Effect.gen(function* () {
          const raw = yield* fs.readFileString(filePath).pipe(
            Effect.mapError(
              (cause) =>
                new ConfigError({
                  reason: 'read',
                  filePath,
                  cause,
                  issues: [],
                }),
            ),
          );

          const json = yield* Effect.try({
            try: () => JSON.parse(raw) as unknown,
            catch: (cause) =>
              new ConfigError({
                reason: 'parse',
                filePath,
                cause,
                issues: [],
              }),
          });

          const decoded = yield* decodeProjectConfig(json).pipe(
            Effect.mapError(
              (cause) =>
                new ConfigError({
                  reason: 'schema',
                  filePath,
                  cause,
                  issues: [],
                }),
            ),
          );

          const issues = validateConfig(decoded);
          if (issues.length > 0) {
            return yield* new ConfigError({
              reason: 'validation',
              filePath,
              cause: issues,
              issues,
            });
          }

          return decoded;
        }).pipe(Effect.withSpan('config.read')),
    };
  }),
);
