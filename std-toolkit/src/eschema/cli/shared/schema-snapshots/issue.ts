import type { SnapshotIssue } from './model.js';

export function issue(
  _tag: SnapshotIssue['_tag'],
  schemaPath: string,
  fields: {
    readonly path?: string;
    readonly version?: string;
  } = {},
  message: string = _tag,
): SnapshotIssue {
  return {
    _tag,
    schemaPath,
    ...(fields.path === undefined ? {} : { path: fields.path }),
    ...(fields.version === undefined ? {} : { version: fields.version }),
    message,
  };
}
