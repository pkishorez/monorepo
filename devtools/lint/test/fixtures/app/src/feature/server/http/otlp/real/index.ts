import { OtlpApi } from '../contract/index.ts';
import { Db } from '../../../services/db/contract/index.ts';
export const ingest = [OtlpApi, Db];
