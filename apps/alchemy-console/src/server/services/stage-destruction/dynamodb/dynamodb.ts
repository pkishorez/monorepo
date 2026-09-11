import { Effect } from 'effect';
import { TableProvider } from 'alchemy/AWS/DynamoDB';
import { describeTable } from '@distilled.cloud/aws/dynamodb';

export const providers = () => TableProvider();

// The native provider deletes by name. Verify the saved physical identity first.
export const check = (
  row: { attr?: unknown; removalPolicy?: string },
  region: string,
  accountId: string,
) =>
  Effect.gen(function* () {
    const attr = row.attr;
    if (
      !attr ||
      typeof attr !== 'object' ||
      !('tableArn' in attr) ||
      typeof attr.tableArn !== 'string' ||
      !('tableName' in attr) ||
      typeof attr.tableName !== 'string'
    )
      return 'The recorded table has no verifiable AWS identity. Use alchemy destroy from the project to recover it.';
    const match =
      /^arn:(aws(?:-[a-z]+)*):dynamodb:([^:]+):(\d{12}):table\/(.+)$/.exec(
        attr.tableArn,
      );
    if (!match || match[4] !== attr.tableName)
      return 'The recorded DynamoDB table identity is invalid.';
    if (match[2] !== region)
      return `This table is in ${match[2]}, but the AWS connection uses ${region}.`;
    if (match[3] !== accountId)
      return 'This table belongs to a different AWS account than the AWS connection.';
    const current = yield* describeTable({ TableName: attr.tableName }).pipe(
      Effect.catchTag('ResourceNotFoundException', () => Effect.succeed(null)),
    );
    if (
      current &&
      (current.Table?.TableArn !== attr.tableArn ||
        ('tableId' in attr &&
          attr.tableId &&
          current.Table?.TableId !== attr.tableId))
    )
      return 'The live table does not match the recorded table. It may have been replaced outside Alchemy.';
    if (
      row.removalPolicy !== 'retain' &&
      current?.Table?.DeletionProtectionEnabled
    )
      return 'AWS deletion protection is enabled for this table. Disable it before reviewing deletion again.';
    return null;
  });
