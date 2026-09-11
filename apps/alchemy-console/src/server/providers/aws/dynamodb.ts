import { Effect } from 'effect';
import { TableProvider } from 'alchemy/AWS/DynamoDB';
import { describeTable } from '@distilled.cloud/aws/dynamodb';

export const providers = () => TableProvider();

type Row = {
  status?: string;
  props?: unknown;
  attr?: unknown;
  removalPolicy?: string;
};
const field = (value: unknown, key: string) =>
  value && typeof value === 'object' && key in value
    ? (value as Record<string, unknown>)[key]
    : undefined;
const parseArn = (arn: string) =>
  /^arn:(aws(?:-[a-z]+)*):dynamodb:([^:]+):(\d{12}):table\/(.+)$/.exec(arn);

/** The account and region a recorded table lives in, when its ARN was recorded. */
export const locate = (row: Row) => {
  const tableArn = field(row.attr, 'tableArn');
  const match = typeof tableArn === 'string' ? parseArn(tableArn) : null;
  return match
    ? { account: match[3]!, region: match[2]! }
    : { account: null, region: null };
};

// The native provider deletes by name. Verify the saved physical identity first.
export const check = (row: Row, region: string, accountId: string) =>
  Effect.gen(function* () {
    const attr = row.attr;
    const tableArn = field(attr, 'tableArn');
    const tableName = field(attr, 'tableName');
    if (typeof tableArn !== 'string' || typeof tableName !== 'string') {
      // An interrupted create records props but no attributes. Alchemy recovers
      // it by reading the table by name before deleting, so verify by name too.
      const propsName = field(row.props, 'tableName');
      if (
        attr !== undefined ||
        row.status !== 'creating' ||
        typeof propsName !== 'string' ||
        !propsName
      )
        return 'The recorded table has no verifiable AWS identity. Use alchemy destroy from the project to recover it.';
      const current = yield* describeTable({ TableName: propsName }).pipe(
        Effect.catchTag('ResourceNotFoundException', () =>
          Effect.succeed(null),
        ),
      );
      // Nothing was created; Alchemy drops the row without touching AWS.
      if (!current) return null;
      const match = parseArn(current.Table?.TableArn ?? '');
      if (!match || match[4] !== propsName)
        return 'The live table has an unexpected identity. Use alchemy destroy from the project to recover it.';
      return locationOrProtection(match, region, accountId, row, current);
    }
    const match = parseArn(tableArn);
    if (!match || match[4] !== tableName)
      return 'The recorded DynamoDB table identity is invalid.';
    const location = locationOrProtection(match, region, accountId, row, null);
    if (location) return location;
    const current = yield* describeTable({ TableName: tableName }).pipe(
      Effect.catchTag('ResourceNotFoundException', () => Effect.succeed(null)),
    );
    if (
      current &&
      (current.Table?.TableArn !== tableArn ||
        ('tableId' in (attr as object) &&
          field(attr, 'tableId') &&
          current.Table?.TableId !== field(attr, 'tableId')))
    )
      return 'The live table does not match the recorded table. It may have been replaced outside Alchemy.';
    return locationOrProtection(match, region, accountId, row, current);
  });

const locationOrProtection = (
  match: RegExpExecArray,
  region: string,
  accountId: string,
  row: Row,
  current: { Table?: { DeletionProtectionEnabled?: boolean } } | null,
) => {
  if (match[2] !== region)
    return `This table is in ${match[2]}, but the selected AWS region is ${region}.`;
  if (match[3] !== accountId)
    return 'This table belongs to a different AWS account than the selected credential.';
  if (
    row.removalPolicy !== 'retain' &&
    current?.Table?.DeletionProtectionEnabled
  )
    return 'AWS deletion protection is enabled for this table. Disable it before reviewing deletion again.';
  return null;
};
