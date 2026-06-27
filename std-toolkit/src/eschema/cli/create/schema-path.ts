import { isAbsolute } from 'node:path';
import { Data, Effect } from 'effect';

export class CreateScaffoldError extends Data.TaggedError(
  'CreateScaffoldError',
)<{
  readonly message: string;
}> {}

export type SchemaPath = {
  readonly segments: readonly string[];
  readonly finalSegment: string;
};

export function parseSchemaPath(
  schemaPath: string,
): Effect.Effect<SchemaPath, CreateScaffoldError> {
  if (schemaPath.length === 0 || isAbsolute(schemaPath)) {
    return Effect.fail(
      new CreateScaffoldError({ message: 'Schema path must be relative' }),
    );
  }

  const segments = schemaPath.split('/');
  if (
    segments.length === 0 ||
    segments.some((segment) => segment.length === 0 || segment === '..')
  ) {
    return Effect.fail(
      new CreateScaffoldError({
        message: 'Schema path must not contain empty or parent segments',
      }),
    );
  }

  return Effect.succeed({
    segments,
    finalSegment: segments[segments.length - 1]!,
  });
}

export function toPascalCase(value: string): string {
  return value
    .split('-')
    .filter((part) => part.length > 0)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join('');
}

export function toCamelCase(value: string): string {
  const pascalCase = toPascalCase(value);
  return `${pascalCase[0]!.toLowerCase()}${pascalCase.slice(1)}`;
}
