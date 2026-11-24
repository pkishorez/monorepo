import { Db } from '../contract/index.ts';
import { rows } from './rows/rows.ts';
export const dbLayer = [Db, rows];
