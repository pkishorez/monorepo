import { Effect } from 'effect';
import { DynamoDB, type DynamoDBNativeError } from 'std-toolkit/db/dynamodb';
import { bankTable } from '../../std-table/table/index.ts';
import { makeBankFetch } from '../handlers/index.ts';

const env = (key: string, fallback: string): string =>
  globalThis.process?.env?.[key] ?? fallback;

const endpoint = env('BANK_DYNAMODB_ENDPOINT', 'http://localhost:8090');
const isLocal = endpoint !== '';

const dynamo = DynamoDB.make(bankTable, {
  tableName: env('BANK_DYNAMODB_TABLE', 'std-bank-v3'),
  region: env('BANK_DYNAMODB_REGION', 'local'),
  credentials: {
    accessKeyId: env('AWS_ACCESS_KEY_ID', 'local'),
    secretAccessKey: env('AWS_SECRET_ACCESS_KEY', 'local'),
  },
  ...(isLocal ? { endpoint } : {}),
});

const tableExists = (error: DynamoDBNativeError) => {
  try {
    return JSON.stringify(error.cause).includes('ResourceInUseException');
  } catch {
    return false;
  }
};

const boot = Effect.gen(function* () {
  if (isLocal)
    yield* dynamo.setup.pipe(
      Effect.catch((error) =>
        tableExists(error) ? Effect.void : Effect.die(error),
      ),
    );
});

let booted: Promise<(request: Request) => Promise<Response>> | undefined;

export const bankServerFetch = (request: Request): Promise<Response> => {
  booted ??= Effect.runPromise(boot).then(() => makeBankFetch(dynamo.layer));
  return booted.then((handle) => handle(request));
};
