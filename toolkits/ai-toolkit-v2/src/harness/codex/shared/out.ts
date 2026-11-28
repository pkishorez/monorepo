import { Data } from 'effect';
import type { Out as ContractOut } from '../contract/index.ts';

export type Out = ContractOut;

export const Out = Data.taggedEnum<Out>();
